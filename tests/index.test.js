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
            })}]
          });
        }
        if (system.includes('threat model') || system.includes('STRIDE')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              components: [{
                name: 'Express API',
                type: 'process',
                threats: [{
                  id: 'T-001',
                  category: 'Spoofing',
                  title: 'Test threat',
                  description: 'Test',
                  likelihood: 'Medium',
                  impact: 'High',
                  risk_score: 7.0,
                  mitigations: [],
                  residual_risk: 'High'
                }]
              }],
              summary: {
                total_threats: 1,
                by_category: { Spoofing: 1 },
                by_risk: { critical: 0, high: 1, medium: 0, low: 0 },
                unmitigated_high_risk: 1
              }
            })}]
          });
        }
        if (system.includes('compliance') || system.includes('auditor')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              framework: 'SOC2',
              version: '2017',
              assessment_date: '2026-02-17',
              controls: [{ control_id: 'CC6.1', description: 'Access', status: 'compliant', coverage: 100, evidence: ['JWT'], gaps: [], recommendations: [] }],
              summary: { total_controls: 1, compliant: 1, partial: 0, non_compliant: 0, overall_score: 100 }
            })}]
          });
        }
        return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
      })
    }
  }));
});

const FIXTURE_PATH = path.join(__dirname, 'fixtures/express-postgres');

describe('Main Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_WORKSPACE = FIXTURE_PATH;
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
    expect(mockCore.setOutput).toHaveBeenCalledWith('compliance-score', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('report-path', expect.any(String));
  });

  test('writes job summary', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addHeading).toHaveBeenCalled();
    expect(mockCore.summary.addTable).toHaveBeenCalled();
    expect(mockCore.summary.write).toHaveBeenCalled();
  });

  test('fails build when fail-on-high-risk is true and high risks exist', async () => {
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
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ flows: [] }) }] });
            }
            if (system.includes('threat model') || system.includes('STRIDE')) {
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({
                components: [],
                summary: { total_threats: 3, by_category: {}, by_risk: { high: 2 }, unmitigated_high_risk: 2 }
              }) }] });
            }
            if (system.includes('compliance') || system.includes('auditor')) {
              return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({
                framework: 'SOC2', version: '2017', controls: [],
                summary: { total_controls: 0, compliant: 0, partial: 0, non_compliant: 0, overall_score: 0 }
              }) }] });
            }
            return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
          })
        }
      }));
    });

    const { run: runFresh } = require('../src/index');
    await runFresh();
    expect(mockCore.setFailed).toHaveBeenCalledWith(expect.stringContaining('unmitigated high-risk'));
  });
});
