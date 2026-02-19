const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { parseJsonResponse, callWithContinuation } = require('../utils/parse-json');

class ComplianceAgent {
  constructor(apiKey, frameworkName) {
    this.client = new Anthropic({ apiKey });
    this.frameworkName = frameworkName;
  }

  _loadFramework() {
    const fileName = this.frameworkName.toLowerCase() + '.json';
    const filePath = path.join(__dirname, '../frameworks/', fileName);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Failed to load framework ${this.frameworkName}:`, error.message);
      return null;
    }
  }

  async assess(threatModel) {
    const framework = this._loadFramework();

    const systemPrompt = `You are a security risk analyst performing PASTA Stage 7 (Risk & Impact Analysis) and compliance assessment against the ${this.frameworkName} framework.

Given the PASTA threat analysis (business objectives, attack surfaces, attack scenarios), produce a risk-centric impact assessment and compliance mapping.

IMPORTANT: Be concise. Keep descriptions to 1 sentence. Focus on actionable output.

Output ONLY valid JSON matching this schema:
{
  "framework": "${this.frameworkName}",
  "version": "Framework version string",
  "assessment_date": "${new Date().toISOString().split('T')[0]}",
  "risk_analysis": [
    {
      "risk_id": "SHORT-ID",
      "title": "Short risk title",
      "pasta_level": "Critical|High|Medium|Low",
      "business_impact": "Brief impact statement",
      "mitigation_complexity": "Low|Medium|High",
      "linked_vulnerabilities": ["VULN-IDs from threat model"]
    }
  ],
  "controls": [
    {
      "control_id": "Control identifier",
      "description": "Control description",
      "status": "compliant|partial|non_compliant",
      "coverage": 0,
      "evidence": ["Brief evidence"],
      "gaps": ["Brief gap if any"],
      "recommendations": ["Brief recommendation"]
    }
  ],
  "tactical_recommendations": [
    {
      "priority": "Immediate|Short-term|Medium-term",
      "action": "Specific actionable recommendation",
      "addresses": ["RISK-IDs this fixes"]
    }
  ],
  "summary": {
    "total_controls": 0,
    "compliant": 0,
    "partial": 0,
    "non_compliant": 0,
    "overall_score": 0
  }
}

Calculate overall_score as percentage: (compliant * 100 + partial * 50) / total_controls.

For risk_analysis: Map each attack surface/scenario to business risk with PASTA severity levels. Focus on business impact, not just technical severity.

For tactical_recommendations: Provide specific, actionable steps ordered by priority. Reference which risks each recommendation addresses.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Perform PASTA Stage 7 risk analysis and ${this.frameworkName} compliance assessment:

PASTA Threat Analysis:
${JSON.stringify(threatModel, null, 2)}

${framework ? `Framework Definition:\n${JSON.stringify(framework, null, 2)}` : `Framework: ${this.frameworkName} (definition not available, use standard knowledge)`}`
        }],
      };

      const text = await callWithContinuation(this.client, params);
      return parseJsonResponse(text);
    } catch (error) {
      console.error('Compliance assessment failed:', error.message);
      return {
        framework: this.frameworkName,
        risk_analysis: [],
        controls: [],
        tactical_recommendations: [],
        summary: {
          total_controls: 0,
          compliant: 0,
          partial: 0,
          non_compliant: 0,
          overall_score: 0
        }
      };
    }
  }
}

module.exports = ComplianceAgent;
