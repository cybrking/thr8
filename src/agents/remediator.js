const core = require('@actions/core');
const github = require('@actions/github');
const Anthropic = require('@anthropic-ai/sdk');
const { parseJsonResponse } = require('../utils/parse-json');
const { createIssueIfNotExists } = require('../github/issues');
const { createFixPR } = require('../github/pull-requests');

const FIX_SYSTEM_PROMPT = `You are a senior security engineer generating a minimal, targeted code fix for a specific vulnerability.

You will receive:
- The vulnerability details (title, description, severity)
- The risk context (business impact, mitigation complexity)
- The recommended action
- Relevant source files from the repository

Produce a JSON response with this exact schema:
{
  "confidence": "high" | "medium" | "low",
  "explanation": "One sentence describing the fix",
  "files": [
    {
      "path": "relative/path/to/file",
      "original_content": "the original file content",
      "fixed_content": "the full fixed file content"
    }
  ],
  "notes": "Any caveats or manual steps needed (optional)"
}

Rules:
- Only modify files that need changing — minimal diff
- Preserve existing code style and formatting
- If you are not confident the fix is correct, set confidence to "low"
- Do NOT introduce new dependencies
- Do NOT change unrelated code
- Output ONLY valid JSON, no markdown fences`;

const MAX_RELEVANT_FILES = 8;

class RemediatorAgent {
  constructor(apiKey, githubToken) {
    this.client = new Anthropic({ apiKey });
    this.octokit = github.getOctokit(githubToken);
    this.context = github.context;
  }

  async remediate({ threatModel, systemContext, scannedFiles, createIssues, autoFix }) {
    const results = { issuesCreated: [], prsCreated: [], errors: [] };

    const vulns = this._extractVulnerabilities(threatModel);
    const risks = this._indexByLinkedVulns(threatModel.risk_analysis || []);
    const recommendations = this._indexRecommendations(threatModel.tactical_recommendations || [], threatModel.risk_analysis || []);

    for (const vuln of vulns) {
      try {
        const risk = risks[vuln.id];
        const rec = recommendations[vuln.id];
        const route = this._classifyRoute(vuln, rec, { autoFix, createIssues });

        if (route === 'pr') {
          const fixData = await this._generateFix(vuln, risk, rec, scannedFiles, systemContext);
          if (!fixData || fixData.confidence === 'low') {
            core.warning(`[thr8] Low confidence fix for ${vuln.id} — skipping PR, falling back to issue`);
            if (createIssues) {
              const result = await createIssueIfNotExists(this.octokit, this.context, vuln, risk, rec);
              if (result.created) results.issuesCreated.push(result.issue);
            }
            continue;
          }
          try {
            const result = await createFixPR(this.octokit, this.context, vuln.id, fixData, risk);
            if (result.created) results.prsCreated.push(result.pr);
          } catch (prError) {
            core.warning(`[thr8] PR creation failed for ${vuln.id}: ${prError.message}`);
            if (createIssues) {
              core.info(`[thr8] Falling back to issue for ${vuln.id}`);
              const fallback = await createIssueIfNotExists(this.octokit, this.context, vuln, risk, rec);
              if (fallback.created) results.issuesCreated.push(fallback.issue);
            }
          }
        } else if (route === 'issue') {
          const result = await createIssueIfNotExists(this.octokit, this.context, vuln, risk, rec);
          if (result.created) results.issuesCreated.push(result.issue);
        }
      } catch (error) {
        core.warning(`[thr8] Failed to remediate ${vuln.id}: ${error.message}`);
        results.errors.push({ vulnId: vuln.id, error: error.message });
      }
    }

    return results;
  }

  _extractVulnerabilities(threatModel) {
    const vulns = [];
    for (const surface of (threatModel.attack_surfaces || [])) {
      for (const v of (surface.vulnerabilities || [])) {
        vulns.push(v);
      }
    }
    return vulns;
  }

  _indexByLinkedVulns(riskAnalysis) {
    const map = {};
    for (const risk of riskAnalysis) {
      for (const vulnId of (risk.linked_vulnerabilities || [])) {
        map[vulnId] = risk;
      }
    }
    return map;
  }

  _indexRecommendations(recommendations, riskAnalysis) {
    // Map recommendation → addressed risk IDs → linked vuln IDs
    const riskToVulns = {};
    for (const risk of riskAnalysis) {
      for (const vulnId of (risk.linked_vulnerabilities || [])) {
        if (!riskToVulns[risk.risk_id]) riskToVulns[risk.risk_id] = [];
        riskToVulns[risk.risk_id].push(vulnId);
      }
    }

    const map = {};
    for (const rec of recommendations) {
      for (const riskId of (rec.addresses || [])) {
        for (const vulnId of (riskToVulns[riskId] || [])) {
          map[vulnId] = rec;
        }
      }
    }
    return map;
  }

  _classifyRoute(vuln, recommendation, { autoFix, createIssues }) {
    const severity = (vuln.severity || '').toLowerCase();
    const isHighSeverity = severity === 'critical' || severity === 'high';
    const isImmediate = recommendation && recommendation.priority === 'Immediate';

    if (autoFix && isHighSeverity && isImmediate) {
      return 'pr';
    }
    if (createIssues) {
      return 'issue';
    }
    return 'skip';
  }

  _scoreFileRelevance(file, vuln, recommendation) {
    const searchText = [
      vuln.title || '',
      vuln.description || '',
      recommendation ? recommendation.action : '',
    ].join(' ').toLowerCase();

    const keywords = searchText
      .split(/\W+/)
      .filter(w => w.length > 2);

    const filePath = file.path.toLowerCase();
    const fileContent = (file.content || '').toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      if (filePath.includes(kw)) score += 3;
      if (fileContent.includes(kw)) score += 1;
    }

    // Boost config/security-related files
    if (/auth|security|middleware|config|route|controller/i.test(file.path)) {
      score += 2;
    }

    return score;
  }

  _selectRelevantFiles(scannedFiles, vuln, recommendation) {
    if (!scannedFiles || scannedFiles.length === 0) return [];

    const scored = scannedFiles.map(f => ({
      file: f,
      score: this._scoreFileRelevance(f, vuln, recommendation),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored
      .filter(s => s.score > 0)
      .slice(0, MAX_RELEVANT_FILES)
      .map(s => s.file);
  }

  async _generateFix(vuln, risk, recommendation, scannedFiles, systemContext) {
    const relevantFiles = this._selectRelevantFiles(scannedFiles, vuln, recommendation);

    if (relevantFiles.length === 0) {
      core.warning(`[thr8] No relevant files found for ${vuln.id} — skipping fix generation`);
      return null;
    }

    const filesSummary = relevantFiles.map(f =>
      `--- ${f.path} ---\n${f.content}`
    ).join('\n\n');

    const userMessage = [
      '## Vulnerability',
      `- **ID:** ${vuln.id}`,
      `- **Title:** ${vuln.title}`,
      `- **Description:** ${vuln.description}`,
      `- **Severity:** ${vuln.severity}`,
      '',
      risk ? `## Risk\n- **Level:** ${risk.pasta_level}\n- **Business Impact:** ${risk.business_impact}\n- **Fix Complexity:** ${risk.mitigation_complexity}` : '',
      '',
      recommendation ? `## Recommended Action\n${recommendation.action}` : '',
      '',
      `## Source Files (${relevantFiles.length} most relevant)`,
      '',
      filesSummary,
    ].join('\n');

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: FIX_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content[0].text;
      return parseJsonResponse(text);
    } catch (error) {
      core.warning(`[thr8] Fix generation failed for ${vuln.id}: ${error.message}`);
      return null;
    }
  }
}

module.exports = RemediatorAgent;
