const Anthropic = require('@anthropic-ai/sdk');
const { parseJsonResponse, callWithContinuation } = require('../utils/parse-json');

class DataFlowAgent {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(context) {
    const systemPrompt = `You are a security architect performing data flow analysis. Given a system inventory (tech stack, infrastructure, API endpoints), map ALL data flows across trust boundaries.

IMPORTANT: Keep descriptions concise. Focus on the most critical data flows (authentication, sensitive data, external integrations).

Output ONLY valid JSON matching this schema:
{
  "flows": [
    {
      "id": "snake_case_flow_name",
      "name": "Human Readable Flow Name",
      "steps": [
        {
          "component": "Component Name",
          "type": "external_user|load_balancer|application|database|external_service",
          "data": ["field1", "field2"],
          "protocol": "HTTPS|TLS|etc",
          "process": "brief description",
          "operation": "DB operation if applicable"
        }
      ],
      "data_classification": "PII|PCI|PHI|Public|Internal",
      "trust_boundaries": [
        {
          "from": "Zone A",
          "to": "Zone B",
          "control": "Security control",
          "authentication": "Auth mechanism or None"
        }
      ]
    }
  ]
}

Be thorough: trace user registration, authentication, payment processing, data retrieval, and any external service integration flows.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Analyze data flows for this system:\n\n${JSON.stringify(context, null, 2)}` }],
      };

      const text = await callWithContinuation(this.client, params);
      return parseJsonResponse(text);
    } catch (error) {
      console.error('Data flow analysis failed:', error.message);
      return { flows: [] };
    }
  }
}

module.exports = DataFlowAgent;
