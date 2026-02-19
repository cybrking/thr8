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
      console.error('Failed to load attack patterns:', error.message);
    }
    return patterns;
  }

  async generate(context) {
    const patterns = this._loadPatterns();

    const systemPrompt = `You are a senior security engineer performing a PASTA (Process for Attack Simulation and Threat Analysis) assessment. Analyze the system and produce a complete risk-centric threat model covering all PASTA Stages (1-2, 4-7).

IMPORTANT: Be concise. 1-2 sentences per description. Focus on the most critical and realistic threats.

Output ONLY valid JSON matching this schema:
{
  "business_objectives": [
    {
      "objective": "e.g. Data Integrity, Availability, Compliance, Confidentiality",
      "impact_of_breach": "High|Medium|Low",
      "description": "Brief business impact statement",
      "tech_context": "Relevant tech from the stack"
    }
  ],
  "overall_risk_status": "CRITICAL|HIGH|MEDIUM|LOW",
  "attack_surfaces": [
    {
      "name": "e.g. Primary Attack Surface",
      "vector": "e.g. Public API Endpoint",
      "weakness": "Brief description of the architectural weakness",
      "vulnerabilities": [
        {
          "id": "COMPONENT-CATEGORY-NNN",
          "title": "Short title",
          "description": "Brief description",
          "severity": "Critical|High|Medium|Low"
        }
      ]
    }
  ],
  "attack_scenarios": [
    {
      "name": "Scenario title describing the end goal",
      "objective": "What the attacker achieves",
      "steps": [
        {
          "phase": "Reconnaissance|Exploitation|Lateral Movement|Persistence|Exfiltration",
          "action": "What the attacker does",
          "exploits": ["VULN-ID-referenced-above"]
        }
      ]
    }
  ],
  "risk_analysis": [
    {
      "risk_id": "SHORT-ID",
      "title": "Short risk title",
      "pasta_level": "Critical|High|Medium|Low",
      "business_impact": "Brief impact statement",
      "mitigation_complexity": "Low|Medium|High",
      "linked_vulnerabilities": ["VULN-IDs from attack_surfaces"]
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
    "total_vulnerabilities": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "attack_scenarios": 0,
    "attack_surfaces": 0
  }
}

Stage 1-2 (business_objectives): Analyze the tech stack and identify what the business is protecting and why it matters.

Stage 4-5 (attack_surfaces): Group vulnerabilities by attack vector. Each surface should have a clear vector, weakness, and specific vulnerabilities.

Stage 6 (attack_scenarios): Model realistic multi-step attack kill chains showing how an attacker would combine vulnerabilities. Reference vulnerability IDs from attack_surfaces.

Stage 7 (risk_analysis): Map each attack surface/scenario to business risk with PASTA severity levels. Focus on business impact, not just technical severity.

Tactical recommendations: Provide specific, actionable steps ordered by priority. Reference which risks each recommendation addresses.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Perform PASTA threat analysis for this system:

System Context:
${JSON.stringify(context, null, 2)}

Attack Pattern Reference:
${JSON.stringify(patterns, null, 2)}`
        }],
      };

      const text = await callWithContinuation(this.client, params);
      return parseJsonResponse(text);
    } catch (error) {
      console.error('Threat generation failed:', error.message);
      return {
        business_objectives: [],
        overall_risk_status: 'UNKNOWN',
        attack_surfaces: [],
        attack_scenarios: [],
        risk_analysis: [],
        tactical_recommendations: [],
        summary: {
          total_vulnerabilities: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          attack_scenarios: 0,
          attack_surfaces: 0
        }
      };
    }
  }
}

module.exports = ThreatGeneratorAgent;
