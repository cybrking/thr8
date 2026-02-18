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

    const systemPrompt = `You are a compliance auditor assessing a system's security controls against the ${this.frameworkName} framework. Evaluate each control requirement, determine compliance status based on the threat model and detected mitigations.

IMPORTANT: Keep evidence and recommendations concise (1 sentence each). Limit gaps to the most critical items only.

Output ONLY valid JSON matching this schema:
{
  "framework": "${this.frameworkName}",
  "version": "Framework version string",
  "assessment_date": "${new Date().toISOString().split('T')[0]}",
  "controls": [
    {
      "control_id": "Control identifier",
      "description": "Control description",
      "status": "compliant|partial|non_compliant",
      "coverage": 0,
      "evidence": ["Brief evidence"],
      "gaps": ["Brief gap if any"],
      "recommendations": ["Brief recommendation if gaps exist"]
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
Be specific about evidence from the threat model and actionable in recommendations.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Assess compliance for this system:

Threat Model:
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
        controls: [],
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
