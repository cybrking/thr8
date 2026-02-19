const path = require('path');

// Mock @actions/core
const mockCore = {
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined),
  },
};
jest.mock('@actions/core', () => mockCore);

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockImplementation(({ system }) => {
        // Return different mock responses based on system prompt content
        if (system.includes('data flow')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              flows: [{
                id: 'test_flow',
                name: 'Test Flow',
                steps: [{ component: 'API', type: 'application' }],
                data_classification: 'PII',
                trust_boundaries: []
              }]
            })}],
            stop_reason: 'end_turn'
          });
        }
        if (system.includes('PASTA')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              business_objectives: [{ objective: 'Data Integrity', impact_of_breach: 'High', description: 'Test', tech_context: 'Node.js' }],
              overall_risk_status: 'HIGH',
              attack_surfaces: [{
                name: 'API',
                vector: 'HTTP',
                weakness: 'No auth',
                vulnerabilities: [{ id: 'V-001', title: 'Test vuln', description: 'Test', severity: 'Critical' }]
              }],
              attack_scenarios: [{
                name: 'Test Attack',
                objective: 'Breach',
                steps: [{ phase: 'Exploitation', action: 'Access API', exploits: ['V-001'] }]
              }],
              summary: {
                total_vulnerabilities: 1,
                critical: 1, high: 0, medium: 0, low: 0,
                attack_scenarios: 1,
                attack_surfaces: 1
              }
            })}],
            stop_reason: 'end_turn'
          });
        }
        if (system.includes('Stage 7') || system.includes('risk analyst')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              framework: 'SOC2',
              version: '2017',
              assessment_date: '2026-02-17',
              risk_analysis: [{ risk_id: 'R-001', title: 'Test Risk', pasta_level: 'Critical', business_impact: 'High', mitigation_complexity: 'Medium', linked_vulnerabilities: ['V-001'] }],
              controls: [{ control_id: 'CC6.1', description: 'Access', status: 'compliant', coverage: 100, evidence: ['JWT'], gaps: [], recommendations: [] }],
              tactical_recommendations: [{ priority: 'Immediate', action: 'Fix auth', addresses: ['R-001'] }],
              summary: { total_controls: 1, compliant: 1, partial: 0, non_compliant: 0, overall_score: 100 }
            })}],
            stop_reason: 'end_turn'
          });
        }
        return Promise.resolve({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' });
      })
    }
  }));
});

const FIXTURE_PATH = path.join(__dirname, 'fixtures/express-postgres');

describe('Main Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_WORKSPACE = FIXTURE_PATH;
    process.env.GITHUB_REPOSITORY = 'cybrking/test-project';
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'anthropic-api-key': 'test-api-key',
        'frameworks': 'SOC2',
        'output-formats': 'markdown,json',
        'fail-on-high-risk': 'false',
      };
      return inputs[name] || '';
    });
  });

  afterEach(() => {
    delete process.env.GITHUB_WORKSPACE;
    delete process.env.GITHUB_REPOSITORY;
  });

  test('runs full PASTA pipeline without error', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  test('sets action outputs', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.setOutput).toHaveBeenCalledWith('threats-found', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('high-risk-count', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('compliance-score', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('report-path', expect.any(String));
  });

  test('writes PASTA job summary', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addHeading).toHaveBeenCalledWith('PASTA Threat Model Generated');
    expect(mockCore.summary.addTable).toHaveBeenCalled();
    expect(mockCore.summary.write).toHaveBeenCalled();
  });

  test('fails build when fail-on-high-risk is true and critical vulns exist', async () => {
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'anthropic-api-key': 'test-api-key',
        'frameworks': 'SOC2',
        'output-formats': 'json',
        'fail-on-high-risk': 'true',
      };
      return inputs[name] || '';
    });

    // Need to re-require to get fresh module
    jest.resetModules();
    jest.mock('@actions/core', () => mockCore);
    jest.mock('@anthropic-ai/sdk', () => {
      return jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockImplementation(({ system }) => {
            if (system.includes('data flow')) {
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ flows: [] }) }], stop_reason: 'end_turn' });
            }
            if (system.includes('PASTA')) {
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({
                business_objectives: [],
                overall_risk_status: 'CRITICAL',
                attack_surfaces: [],
                attack_scenarios: [],
                summary: { total_vulnerabilities: 3, critical: 2, high: 1, medium: 0, low: 0, attack_scenarios: 1, attack_surfaces: 1 }
              }) }], stop_reason: 'end_turn' });
            }
            if (system.includes('Stage 7') || system.includes('risk analyst')) {
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({
                framework: 'SOC2', version: '2017', risk_analysis: [], controls: [], tactical_recommendations: [],
                summary: { total_controls: 0, compliant: 0, partial: 0, non_compliant: 0, overall_score: 0 }
              }) }], stop_reason: 'end_turn' });
            }
            return Promise.resolve({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' });
          })
        }
      }));
    });

    const { run: runFresh } = require('../src/index');
    await runFresh();
    expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('critical-risk'));
  });
});
