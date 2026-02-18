const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

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
      "evidence": ["Evidence item 1"],
      "gaps": ["Gap description if any"],
      "recommendations": ["Recommendation if gaps exist"]
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
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Assess compliance for this system:

Threat Model:
${JSON.stringify(threatModel, null, 2)}

${framework ? `Framework Definition:\n${JSON.stringify(framework, null, 2)}` : `Framework: ${this.frameworkName} (definition not available, use standard knowledge)`}`
        }],
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || [null, text];
      return JSON.parse(jsonMatch[1]);
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
