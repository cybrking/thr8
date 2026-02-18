const path = require('path');
const ThreatGeneratorAgent = require('../../src/agents/threat-generator');

const mockThreatModel = {
  components: [{
    name: 'Express API Server',
    type: 'process',
    threats: [{
      id: 'API-SPOOF-001',
      category: 'Spoofing',
      title: 'JWT token forgery',
      description: 'Attacker creates fake JWT to impersonate users',
      likelihood: 'Medium',
      impact: 'High',
      risk_score: 7.5,
      mitigations: [{ control: 'RS256 JWT signing', status: 'implemented', evidence: 'jsonwebtoken with RS256' }],
      residual_risk: 'Low'
    }]
  }],
  summary: {
    total_threats: 12,
    by_category: { Spoofing: 2, Tampering: 3, Repudiation: 1, 'Information Disclosure': 3, 'Denial of Service': 2, 'Elevation of Privilege': 1 },
    by_risk: { critical: 1, high: 3, medium: 5, low: 3 },
    unmitigated_high_risk: 2
  }
};

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockThreatModel) }]
      })
    }
  }));
});

describe('ThreatGeneratorAgent', () => {
  test('returns structured threat model with summary', async () => {
    const agent = new ThreatGeneratorAgent('test-key');
    const result = await agent.generate({
      techStack: { framework: { name: 'Express' } },
      infrastructure: { provider: 'AWS' },
      apiSurface: { endpoints: [] },
      dataFlows: { flows: [] },
    });
    expect(result.components).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.total_threats).toBe(12);
    expect(result.summary.by_category).toBeDefined();
    expect(result.summary.unmitigated_high_risk).toBe(2);
  });

  test('falls back to empty on error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockRejectedValue(new Error('fail')) }
    }));
    const agent = new ThreatGeneratorAgent('test-key');
    const result = await agent.generate({
      techStack: {}, infrastructure: {}, apiSurface: { endpoints: [] }, dataFlows: { flows: [] }
    });
    expect(result.components).toEqual([]);
    expect(result.summary.total_threats).toBe(0);
  });
});
