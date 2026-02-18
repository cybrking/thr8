const Anthropic = require('@anthropic-ai/sdk');

class DataFlowAgent {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(context) {
    const systemPrompt = `You are a security architect performing data flow analysis. Given a system inventory (tech stack, infrastructure, API endpoints), map ALL data flows across trust boundaries.

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
          "process": "description of processing",
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
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Analyze data flows for this system:\n\n${JSON.stringify(context, null, 2)}` }],
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || [null, text];
      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      console.error('Data flow analysis failed:', error.message);
      return { flows: [] };
    }
  }
}

module.exports = DataFlowAgent;
