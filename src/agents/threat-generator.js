const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { parseJsonResponse, callWithContinuation } = require('../utils/parse-json');

class ThreatGeneratorAgent {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  _loadPatterns() {
    const patternsDir = path.join(__dirname, '../patterns/');
    const patterns = {};
    try {
      const files = fs.readdirSync(patternsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const name = path.basename(file, '.json');
        patterns[name] = JSON.parse(fs.readFileSync(path.join(patternsDir, file), 'utf8'));
      }
    } catch (error) {
      console.error('Failed to load STRIDE patterns:', error.message);
    }
    return patterns;
  }

  async generate(context) {
    const patterns = this._loadPatterns();

    const systemPrompt = `You are a senior security engineer performing STRIDE threat modeling. Analyze each component in the system and identify threats using the STRIDE framework (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).

Use the provided STRIDE patterns as reference but also identify threats specific to this codebase.

IMPORTANT: Keep descriptions concise (1-2 sentences max). Limit to the 3-4 most critical threats per component. Keep CVSS vectors short.

Output ONLY valid JSON matching this schema:
{
  "components": [
    {
      "name": "Component Name",
      "type": "process|data_store|data_flow|external_entity",
      "threats": [
        {
          "id": "COMPONENT-CATEGORY-NNN",
          "category": "Spoofing|Tampering|Repudiation|Information Disclosure|Denial of Service|Elevation of Privilege",
          "title": "Short threat title",
          "description": "Brief threat description",
          "likelihood": "Low|Medium|High|Critical",
          "impact": "Low|Medium|High|Critical",
          "risk_score": 0.0,
          "cvss_vector": "CVSS:3.1/AV:N/AC:L/...",
          "mitigations": [
            {
              "control": "Control name",
              "status": "implemented|partial|missing",
              "evidence": "Brief evidence"
            }
          ],
          "residual_risk": "Low|Medium|High|Critical"
        }
      ]
    }
  ],
  "summary": {
    "total_threats": 0,
    "by_category": { "Spoofing": 0, "Tampering": 0, "Repudiation": 0, "Information Disclosure": 0, "Denial of Service": 0, "Elevation of Privilege": 0 },
    "by_risk": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
    "unmitigated_high_risk": 0
  }
}

Calculate risk_score using likelihood x impact (1-10 scale). Count unmitigated_high_risk as threats with risk_score >= 7 and no implemented mitigations.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Perform STRIDE threat modeling for this system:

System Context:
${JSON.stringify(context, null, 2)}

STRIDE Reference Patterns:
${JSON.stringify(patterns, null, 2)}`
        }],
      };

      const text = await callWithContinuation(this.client, params);
      return parseJsonResponse(text);
    } catch (error) {
      console.error('Threat generation failed:', error.message);
      return {
        components: [],
        summary: {
          total_threats: 0,
          by_category: {},
          by_risk: {},
          unmitigated_high_risk: 0
        }
      };
    }
  }
}

module.exports = ThreatGeneratorAgent;
