const path = require('path');

const mockCore = {
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    addRaw: jest.fn().mockReturnThis(),
    addSeparator: jest.fn().mockReturnThis(),
    addDetails: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined),
  },
};
jest.mock('@actions/core', () => mockCore);

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(() => ({
    rest: {
      search: { issuesAndPullRequests: jest.fn().mockResolvedValue({ data: { items: [] } }) },
      issues: {
        getLabel: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ data: { number: 1, title: 'test', html_url: 'https://github.com/test/1' } }),
        listForRepo: jest.fn().mockResolvedValue({ data: [] }),
      },
      pulls: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({ data: { number: 2, title: 'fix', html_url: 'https://github.com/test/pull/2' } }),
      },
      repos: {
        get: jest.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        getContent: jest.fn().mockResolvedValue({ data: { sha: 'abc' } }),
        createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
      },
      git: {
        getRef: jest.fn().mockResolvedValue({ data: { object: { sha: 'sha123' } } }),
        createRef: jest.fn().mockResolvedValue({}),
      },
    },
  })),
  context: { repo: { owner: 'cybrking', repo: 'test-project' } },
}));

// Prevent Chrome launch during tests
jest.mock('../src/utils/chrome-finder', () => ({
  findChrome: jest.fn(() => null),
  CHROME_PATHS: { linux: [], darwin: [], win32: [] },
}));

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
                vulnerabilities: [{ id: 'V-001', title: 'Test Vuln', description: 'Test', severity: 'Medium' }]
              }],
              attack_scenarios: [{ name: 'Test', objective: 'Test', steps: [{ phase: 'Exploitation', action: 'Test', exploits: ['V-001'] }] }],
              risk_analysis: [{ risk_id: 'R-001', title: 'Test', pasta_level: 'Medium', business_impact: 'Test', mitigation_complexity: 'Low', linked_vulnerabilities: ['V-001'] }],
              tactical_recommendations: [{ priority: 'Immediate', action: 'Fix auth', addresses: ['R-001'] }],
              summary: { total_vulnerabilities: 1, critical: 0, high: 0, medium: 1, low: 0, attack_scenarios: 1, attack_surfaces: 1 }
            })}],
            stop_reason: 'end_turn'
          });
        }
        if (system.includes('security engineer')) {
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify({
              confidence: 'high',
              explanation: 'Added input validation',
              files: [{ path: 'src/app.js', original_content: 'old', fixed_content: 'new' }],
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
      'github-token': '',
      'create-issues': 'false',
      'auto-fix': 'false',
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

  test('sets remediation outputs', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', expect.any(Number));
    expect(mockCore.setOutput).toHaveBeenCalledWith('prs-created', expect.any(Number));
  });

  test('logs files scanned count', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Scanned'));
  });

  test('writes PASTA job summary', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addHeading).toHaveBeenCalledWith('PASTA Threat Model Results', 1);
    expect(mockCore.summary.write).toHaveBeenCalled();
  });

  test('summary includes recommended actions for Immediate priority', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addTable).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ data: 'Priority', header: true }),
          expect.objectContaining({ data: 'Action', header: true }),
          expect.objectContaining({ data: 'Addresses', header: true }),
        ]),
        expect.arrayContaining(['Immediate', 'Fix auth', 'R-001']),
      ])
    );
  });

  test('summary uses collapsible details for attack scenarios', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.summary.addDetails).toHaveBeenCalledWith(
      'Attack Scenarios',
      expect.stringContaining('<strong>Test</strong>')
    );
  });

  test('always generates HTML report alongside other formats', async () => {
    const { run } = require('../src/index');
    await run();
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('HTML report generated'));
  });

  test('skips remediation when github-token is empty', async () => {
    const { run } = require('../src/index');
    await run();
    // Should not start the remediation group
    expect(mockCore.startGroup).not.toHaveBeenCalledWith('Running automated remediation...');
  });

  test('runs remediation when create-issues is true', async () => {
    mockCore.getInput.mockImplementation((name) => ({
      'anthropic-api-key': 'test-api-key',
      'output-formats': 'markdown,json',
      'fail-on-high-risk': 'false',
      'github-token': 'ghp_test123',
      'create-issues': 'true',
      'auto-fix': 'false',
    }[name] || ''));

    const { run } = require('../src/index');
    await run();
    expect(mockCore.startGroup).toHaveBeenCalledWith('Running automated remediation...');
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Issues created:'));
  });

  test('runs remediation with auto-fix', async () => {
    mockCore.getInput.mockImplementation((name) => ({
      'anthropic-api-key': 'test-api-key',
      'output-formats': 'markdown,json',
      'fail-on-high-risk': 'false',
      'github-token': 'ghp_test123',
      'create-issues': 'true',
      'auto-fix': 'true',
    }[name] || ''));

    const { run } = require('../src/index');
    await run();
    expect(mockCore.startGroup).toHaveBeenCalledWith('Running automated remediation...');
    expect(mockCore.info).toHaveBeenCalledWith(expect.stringContaining('Fix PRs created:'));
  });
});
