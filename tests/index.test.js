const path = require('path');

const mockCore = {
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  info: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined),
  },
};
jest.mock('@actions/core', () => mockCore);

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockImplementation(({ system }) => {
        if (system.includes('codebase analysis')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              system_context: {
                project_name: 'test-app',
                description: 'Test',
                tech_stack: { languages: ['JavaScript'], frameworks: ['Express'], databases: [], external_services: [], auth_mechanisms: [], security_controls: [] },
                infrastructure: { provider: 'None', containerized: false, services: [] },
                api_surface: { endpoints: [] },
                sensitive_patterns: []
              },
              data_flows: {
                flows: [{
                  id: 'test_flow', name: 'Test Flow',
                  steps: [{ component: 'API', type: 'application' }],
                  data_classification: 'Internal', trust_boundaries: []
                }]
              }
            })}],
            stop_reason: 'end_turn'
          });
        }
        if (system.includes('PASTA')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              business_objectives: [{ objective: 'Availability', impact_of_breach: 'High', description: 'Test', tech_context: 'Node.js' }],
              overall_risk_status: 'MEDIUM',
              attack_surfaces: [{
                name: 'API', vector: 'HTTP', weakness: 'No auth',
                vulnerabilities: [{ id: 'V-001', title: 'Test', description: 'Test', severity: 'Medium' }]
              }],
              attack_scenarios: [{ name: 'Test', objective: 'Test', steps: [{ phase: 'Exploitation', action: 'Test', exploits: ['V-001'] }] }],
              risk_analysis: [{ risk_id: 'R-001', title: 'Test', pasta_level: 'Medium', business_impact: 'Test', mitigation_complexity: 'Low', linked_vulnerabilities: ['V-001'] }],
              tactical_recommendations: [{ priority: 'Immediate', action: 'Fix auth', addresses: ['R-001'] }],
              summary: { total_vulnerabilities: 1, critical: 0, high: 0, medium: 1, low: 0, attack_scenarios: 1, attack_surfaces: 1 }
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
    mockCore.getInput.mockImplementation((name) => ({
      'anthropic-api-key': 'test-api-key',
      'output-formats': 'markdown,json',
      'fail-on-high-risk': 'false',
    }[name] || ''));
  });

  afterEach(() => {
    delete process.env.GITHUB_WORKSPACE;
    delete process.env.GITHUB_REPOSITORY;
  });

  test('runs full pipeline without error', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
  });

  test('sets action outputs', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.setOutput).toHaveBeenCalledWith('threats-found', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('high-risk-count', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('report-path', expect.any(String));
  });

  test('logs files scanned count', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Scanned'));
  });

  test('writes PASTA job summary', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addHeading).toHaveBeenCalledWith('PASTA Threat Model Generated');
    expect(mockCore.summary.write).toHaveBeenCalled();
  });
});
