const ComplianceAgent = require('../../src/agents/compliance');

const mockAssessment = {
  framework: 'SOC2',
  version: '2017 Trust Service Criteria',
  assessment_date: '2026-02-17',
  risk_analysis: [{
    risk_id: 'AUTH-001',
    title: 'Auth Bypass',
    pasta_level: 'Critical',
    business_impact: 'Full data breach',
    mitigation_complexity: 'Medium',
    linked_vulnerabilities: ['API-SPOOF-001']
  }],
  controls: [
    {
      control_id: 'CC6.1',
      description: 'Logical access security',
      status: 'compliant',
      coverage: 100,
      evidence: ['JWT authentication', 'AWS IAM roles'],
      gaps: [],
      recommendations: []
    },
    {
      control_id: 'CC7.2',
      description: 'System monitoring',
      status: 'partial',
      coverage: 65,
      evidence: ['CloudWatch logging'],
      gaps: ['No alerting on failed auth'],
      recommendations: ['Configure CloudWatch alarm for failed logins']
    }
  ],
  tactical_recommendations: [
    { priority: 'Immediate', action: 'Implement authentication middleware', addresses: ['AUTH-001'] }
  ],
  summary: {
    total_controls: 16,
    compliant: 10,
    partial: 4,
    non_compliant: 2,
    overall_score: 75
  }
};

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockAssessment) }],
        stop_reason: 'end_turn'
      })
    }
  }));
});

describe('ComplianceAgent', () => {
  test('returns PASTA Stage 7 risk analysis with compliance', async () => {
    const agent = new ComplianceAgent('test-key', 'SOC2');
    const result = await agent.assess({
      attack_surfaces: [], attack_scenarios: [], summary: { total_vulnerabilities: 5 }
    });
    expect(result.framework).toBe('SOC2');
    expect(result.risk_analysis).toBeDefined();
    expect(result.risk_analysis[0].pasta_level).toBe('Critical');
    expect(result.tactical_recommendations).toBeDefined();
    expect(result.summary.overall_score).toBe(75);
  });

  test('identifies gaps with recommendations', async () => {
    const agent = new ComplianceAgent('test-key', 'SOC2');
    const result = await agent.assess({
      attack_surfaces: [], attack_scenarios: [], summary: { total_vulnerabilities: 5 }
    });
    const partialControls = result.controls.filter(c => c.status === 'partial');
    expect(partialControls.length).toBeGreaterThan(0);
    expect(partialControls[0].gaps.length).toBeGreaterThan(0);
  });

  test('falls back on error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockRejectedValue(new Error('fail')) }
    }));
    const agent = new ComplianceAgent('test-key', 'SOC2');
    const result = await agent.assess({ attack_surfaces: [], summary: {} });
    expect(result.framework).toBe('SOC2');
    expect(result.summary.overall_score).toBe(0);
    expect(result.risk_analysis).toEqual([]);
    expect(result.tactical_recommendations).toEqual([]);
  });
});
