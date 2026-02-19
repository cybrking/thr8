const path = require('path');
const ThreatGeneratorAgent = require('../../src/agents/threat-generator');

const mockPastaModel = {
  business_objectives: [{
    objective: 'Data Integrity',
    impact_of_breach: 'High',
    description: 'No database persistence',
    tech_context: 'Node.js, Express'
  }],
  overall_risk_status: 'HIGH',
  attack_surfaces: [{
    name: 'Primary Attack Surface',
    vector: 'Public API Endpoint',
    weakness: 'No authentication middleware',
    vulnerabilities: [{
      id: 'API-SPOOF-001',
      title: 'Unrestricted API access',
      description: 'No auth on business logic endpoints',
      severity: 'Critical'
    }]
  }],
  attack_scenarios: [{
    name: 'Full Data Exfiltration',
    objective: 'Extract all user data',
    steps: [
      { phase: 'Reconnaissance', action: 'Probe API endpoints', exploits: [] },
      { phase: 'Exploitation', action: 'Access unprotected endpoints', exploits: ['API-SPOOF-001'] }
    ]
  }],
  risk_analysis: [{
    risk_id: 'AUTH-001',
    title: 'Auth Bypass',
    pasta_level: 'Critical',
    business_impact: 'Full data breach',
    mitigation_complexity: 'Medium',
    linked_vulnerabilities: ['API-SPOOF-001']
  }],
  tactical_recommendations: [
    { priority: 'Immediate', action: 'Implement authentication middleware', addresses: ['AUTH-001'] }
  ],
  summary: {
    total_vulnerabilities: 5,
    critical: 1,
    high: 2,
    medium: 1,
    low: 1,
    attack_scenarios: 1,
    attack_surfaces: 1
  }
};

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockPastaModel) }],
        stop_reason: 'end_turn'
      })
    }
  }));
});

describe('ThreatGeneratorAgent', () => {
  test('returns full PASTA model with all stages', async () => {
    const agent = new ThreatGeneratorAgent('test-key');
    const result = await agent.generate({
      techStack: { framework: { name: 'Express' } },
      infrastructure: { provider: 'AWS' },
      apiSurface: { endpoints: [] },
      dataFlows: { flows: [] },
    });
    expect(result.business_objectives).toBeDefined();
    expect(result.overall_risk_status).toBe('HIGH');
    expect(result.attack_surfaces[0].vulnerabilities.length).toBeGreaterThan(0);
    expect(result.attack_scenarios).toBeDefined();
    expect(result.risk_analysis[0].pasta_level).toBe('Critical');
    expect(result.tactical_recommendations.length).toBeGreaterThan(0);
    expect(result.summary.total_vulnerabilities).toBe(5);
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
    expect(result.attack_surfaces).toEqual([]);
    expect(result.risk_analysis).toEqual([]);
    expect(result.tactical_recommendations).toEqual([]);
    expect(result.summary.total_vulnerabilities).toBe(0);
  });
});
