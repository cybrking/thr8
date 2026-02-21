const core = require('@actions/core');
const path = require('path');

const CodebaseScannerAgent = require('./agents/codebase-scanner');
const ThreatGeneratorAgent = require('./agents/threat-generator');
const ReporterAgent = require('./agents/reporter');
const RemediatorAgent = require('./agents/remediator');

async function run() {
  try {
    const repoPath = process.env.GITHUB_WORKSPACE;
    const apiKey = core.getInput('anthropic-api-key', { required: true });
    const outputFormats = core.getInput('output-formats').split(',').map(s => s.trim()).filter(Boolean);
    const failOnHighRisk = core.getInput('fail-on-high-risk') === 'true';
    const githubToken = core.getInput('github-token');
    const createIssues = core.getInput('create-issues') === 'true';
    const autoFix = core.getInput('auto-fix') === 'true';

    // Derive project name from repo
    const repoName = process.env.GITHUB_REPOSITORY || path.basename(repoPath);

    // Step 1: Scan codebase + map data flows (PASTA Stage 3)
    core.startGroup('Scanning codebase...');
    const { systemContext, dataFlows, filesScanned, files } = await new CodebaseScannerAgent(apiKey).analyze(repoPath);
    core.info(`Scanned ${filesScanned} files`);
    core.endGroup();

    // Step 2: PASTA threat analysis (Stages 1-2, 4-7)
    core.startGroup('Generating PASTA threat analysis...');
    const threatModel = await new ThreatGeneratorAgent(apiKey).generate({
      systemContext, dataFlows,
    });
    core.endGroup();

    // Step 3: Generate reports
    core.startGroup('Generating reports...');
    const outputDir = path.join(repoPath, 'threat-model');
    const reportOutputs = await new ReporterAgent().generate({
      threatModel,
      dataFlows,
      formats: outputFormats,
      outputDir,
      projectName: repoName,
    });

    core.info(`HTML report generated: ${reportOutputs.html}`);
    if (reportOutputs.pdf) {
      core.info(`PDF report generated: ${reportOutputs.pdf}`);
    } else if (outputFormats.includes('pdf')) {
      core.warning('PDF generation skipped — Chrome not available. HTML report contains Mermaid.js CDN fallback.');
    }
    core.info('Tip: Use actions/upload-artifact to persist HTML/PDF reports as workflow artifacts.');
    core.endGroup();

    // Step 4: Automated remediation
    let remediationResults = null;
    if (githubToken && (createIssues || autoFix)) {
      core.startGroup('Running automated remediation...');
      try {
        const remediator = new RemediatorAgent(apiKey, githubToken);
        remediationResults = await remediator.remediate({
          threatModel,
          systemContext,
          scannedFiles: files,
          createIssues,
          autoFix,
        });
        core.info(`Issues created: ${remediationResults.issuesCreated.length}`);
        core.info(`Fix PRs created: ${remediationResults.prsCreated.length}`);
        if (remediationResults.errors.length > 0) {
          core.warning(`Remediation errors: ${remediationResults.errors.length}`);
        }
      } catch (error) {
        core.warning(`Remediation failed: ${error.message}`);
      }
      core.endGroup();
    }

    // Step 5: Set outputs
    const totalVulns = threatModel.summary?.total_vulnerabilities || 0;
    const criticalCount = threatModel.summary?.critical || 0;
    const riskStatus = threatModel.overall_risk_status || 'UNKNOWN';

    core.setOutput('threats-found', totalVulns);
    core.setOutput('high-risk-count', criticalCount);
    core.setOutput('report-path', outputDir);
    core.setOutput('issues-created', remediationResults ? remediationResults.issuesCreated.length : 0);
    core.setOutput('prs-created', remediationResults ? remediationResults.prsCreated.length : 0);

    // Step 6: Job summary
    const riskOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const priorityOrder = { Immediate: 0, 'Short-term': 1 };

    // Section 1 — Overall Risk
    core.summary
      .addHeading('PASTA Threat Model Results', 1)
      .addRaw(`**Overall Risk: ${riskStatus}**\n\n`);

    // Section 2 — Top Risks (sorted Critical → Low)
    const allRisks = [...(threatModel.risk_analysis || [])].sort(
      (a, b) => (riskOrder[a.pasta_level] ?? 9) - (riskOrder[b.pasta_level] ?? 9)
    );
    if (allRisks.length > 0) {
      core.summary
        .addHeading('Top Risks', 3)
        .addTable([
          [
            { data: 'Risk', header: true },
            { data: 'Level', header: true },
            { data: 'Business Impact', header: true },
            { data: 'Fix Complexity', header: true },
          ],
          ...allRisks.map(r => [r.title, r.pasta_level, r.business_impact, r.mitigation_complexity]),
        ]);
    }

    // Section 3 — Recommended Actions (sorted Immediate → Short-term)
    const urgentActions = (threatModel.tactical_recommendations || [])
      .filter(r => r.priority === 'Immediate' || r.priority === 'Short-term')
      .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
    if (urgentActions.length > 0) {
      core.summary
        .addHeading('Recommended Actions', 3)
        .addTable([
          [
            { data: 'Priority', header: true },
            { data: 'Action', header: true },
            { data: 'Addresses', header: true },
          ],
          ...urgentActions.map(r => [r.priority, r.action, (r.addresses || []).join(', ')]),
        ]);
    }

    // Section 4 — Attack Scenarios (collapsible, HTML table)
    const scenarios = threatModel.attack_scenarios || [];
    if (scenarios.length > 0) {
      const scenarioRows = scenarios.map(s =>
        `<tr><td><strong>${s.name}</strong></td><td>${s.objective}</td></tr>`
      ).join('\n');
      const scenarioTable = `<table>\n<tr><th>Scenario</th><th>Objective</th></tr>\n${scenarioRows}\n</table>`;
      core.summary.addDetails('Attack Scenarios', scenarioTable);
    }

    // Section 5 — Automated Remediation
    if (remediationResults) {
      const prLinks = remediationResults.prsCreated.map(pr =>
        `- [${pr.title}](${pr.html_url})`
      ).join('\n');
      const issueLinks = remediationResults.issuesCreated.map(issue =>
        `- [${issue.title}](${issue.html_url})`
      ).join('\n');

      let remediationSummary = '';
      if (remediationResults.prsCreated.length > 0) {
        remediationSummary += `**Fix PRs:** ${remediationResults.prsCreated.length}\n${prLinks}\n\n`;
      }
      if (remediationResults.issuesCreated.length > 0) {
        remediationSummary += `**Issues:** ${remediationResults.issuesCreated.length}\n${issueLinks}\n\n`;
      }
      if (remediationResults.errors.length > 0) {
        remediationSummary += `**Errors:** ${remediationResults.errors.length} vulnerabilities could not be remediated\n`;
      }

      if (remediationSummary) {
        core.summary
          .addHeading('Automated Remediation', 3)
          .addRaw(remediationSummary);
      }
    }

    await core.summary.write();

    // Step 7: Fail if needed
    if (failOnHighRisk && criticalCount > 0) {
      core.setFailed(`Found ${criticalCount} critical-risk vulnerabilities`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
