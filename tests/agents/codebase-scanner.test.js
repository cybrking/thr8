const path = require('path');
const CodebaseScannerAgent = require('../../src/agents/codebase-scanner');

const mockScanResult = {
  system_context: {
    project_name: 'express-postgres-app',
    description: 'REST API with PostgreSQL backend',
    tech_stack: {
      languages: ['JavaScript'],
      frameworks: ['Express'],
      databases: ['PostgreSQL'],
      external_services: ['Stripe'],
      auth_mechanisms: ['JWT'],
      security_controls: ['Helmet', 'bcrypt']
    },
    infrastructure: {
      provider: 'AWS',
      containerized: true,
      services: ['EC2', 'RDS']
    },
    api_surface: {
      endpoints: [
        { method: 'POST', path: '/api/users', auth_required: false, description: 'User registration', sensitive_data: ['email', 'password'] }
      ]
    },
    sensitive_patterns: [
      { file: 'app.js', finding: 'No rate limiting on auth endpoints', severity: 'Medium' }
    ]
  },
  data_flows: {
    flows: [{
      id: 'user_registration',
      name: 'User Registration',
      steps: [
        { component: 'Browser', type: 'external_user', data: ['email', 'password'], protocol: 'HTTPS' },
        { component: 'Express API', type: 'application', process: 'Validate and hash password' },
        { component: 'PostgreSQL', type: 'database', operation: 'INSERT INTO users' }
      ],
      data_classification: 'PII',
      trust_boundaries: [{ from: 'Internet', to: 'Application', control: 'TLS', authentication: 'None' }]
    }]
  }
};

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockScanResult) }],
        stop_reason: 'end_turn'
      })
    }
  }));
});

const FIXTURE_PATH = path.join(__dirname, '../fixtures/express-postgres');

describe('CodebaseScannerAgent', () => {
  test('scans codebase and returns system context + data flows', async () => {
    const agent = new CodebaseScannerAgent('test-key');
    const result = await agent.analyze(FIXTURE_PATH);

    expect(result.systemContext).toBeDefined();
    expect(result.systemContext.tech_stack.frameworks).toContain('Express');
    expect(result.dataFlows.flows.length).toBeGreaterThan(0);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  test('collects files from fixture directory', async () => {
    const agent = new CodebaseScannerAgent('test-key');
    const files = agent._collectFiles(FIXTURE_PATH);
    const paths = files.map(f => f.path);

    expect(paths).toContain('package.json');
    // Should find source files
    expect(paths.some(p => p.endsWith('.js'))).toBe(true);
  });

  test('rejects on API error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockRejectedValue(new Error('API error')) }
    }));
    const agent = new CodebaseScannerAgent('test-key');
    await expect(agent.analyze(FIXTURE_PATH)).rejects.toThrow('Codebase scan failed: API error');
  });
});


describe('Scanner coverage integrity', () => {
  const fs = require('fs');
  const os = require('os');
  let repo;
  beforeEach(() => { repo = fs.mkdtempSync(path.join(os.tmpdir(), 'thr8-scanner-')); });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  test('exposes truncated source coverage', () => {
    fs.writeFileSync(path.join(repo, 'route.js'), 'x'.repeat(9000));
    fs.writeFileSync(path.join(repo, 'new.js'), 'return participants;');
    const agent = new CodebaseScannerAgent('test-key');
    const files = agent._readFiles(agent._collectFiles(repo));
    expect(files.find(f => f.path === 'route.js').content.length).toBe(8000);
    expect(agent.readOmissions).toEqual([expect.stringContaining('Truncated source: route.js')]);
  });
  test('collects workflows and skips symlinked source outside the repository', () => {
    fs.mkdirSync(path.join(repo, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.github/workflows/build.yml'), 'permissions: read-all');
    fs.symlinkSync('/etc/hosts', path.join(repo, 'escaped.js'));
    const files = new CodebaseScannerAgent('test-key')._collectFiles(repo);
    expect(files.map(f => f.path)).toEqual(['.github/workflows/build.yml']);
  });
  test('rejects an empty repository before attempting analysis', async () => {
    await expect(new CodebaseScannerAgent('test-key').analyze(repo)).rejects.toThrow('no readable source');
  });
});
