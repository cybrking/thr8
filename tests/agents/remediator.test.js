jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  info: jest.fn(),
}));

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(() => 'mock-octokit'),
  context: { repo: { owner: 'test-owner', repo: 'test-repo' } },
}));

const highConfidenceResponse = {
  content: [{ type: 'text', text: JSON.stringify({
    confidence: 'high',
    explanation: 'Added input validation',
    files: [{ path: 'src/app.js', original_content: 'old', fixed_content: 'new' }],
    notes: null,
  })}],
  stop_reason: 'end_turn',
};

function resetAnthropicMock(response = highConfidenceResponse) {
  const Anthropic = require('@anthropic-ai/sdk');
  Anthropic.mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue(response),
    },
  }));
}

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          confidence: 'high',
          explanation: 'Added input validation',
          files: [{ path: 'src/app.js', original_content: 'old', fixed_content: 'new' }],
          notes: null,
        })}],
        stop_reason: 'end_turn',
      }),
    },
  }));
});

jest.mock('../../src/github/issues', () => ({
  createIssueIfNotExists: jest.fn().mockResolvedValue({
    created: true,
    issue: { number: 1, title: 'test issue', html_url: 'https://github.com/test/1' },
  }),
}));

jest.mock('../../src/github/pull-requests', () => ({
  createFixPR: jest.fn().mockResolvedValue({
    created: true,
    pr: { number: 2, title: 'test pr', html_url: 'https://github.com/test/pull/2' },
  }),
}));

const RemediatorAgent = require('../../src/agents/remediator');
const { createIssueIfNotExists } = require('../../src/github/issues');
const { createFixPR } = require('../../src/github/pull-requests');

const baseThreatModel = {
  attack_surfaces: [{
    name: 'API',
    vulnerabilities: [
      { id: 'V-001', title: 'SQL Injection', description: 'Unsanitized input', severity: 'Critical' },
      { id: 'V-002', title: 'Missing CSRF', description: 'No CSRF tokens', severity: 'Medium' },
    ],
  }],
  risk_analysis: [
    { risk_id: 'R-001', title: 'Data Breach', pasta_level: 'Critical', business_impact: 'High', mitigation_complexity: 'Low', linked_vulnerabilities: ['V-001'] },
    { risk_id: 'R-002', title: 'Session Hijack', pasta_level: 'Medium', business_impact: 'Medium', mitigation_complexity: 'Medium', linked_vulnerabilities: ['V-002'] },
  ],
  tactical_recommendations: [
    { priority: 'Immediate', action: 'Use parameterized queries', addresses: ['R-001'] },
    { priority: 'Short-term', action: 'Add CSRF protection', addresses: ['R-002'] },
  ],
};

const scannedFiles = [
  { path: 'src/app.js', content: 'const query = "SELECT * FROM users WHERE id=" + req.params.id;' },
  { path: 'src/routes.js', content: 'app.get("/api/users", handler);' },
];

describe('RemediatorAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAnthropicMock();
  });

  describe('classification', () => {
    test('routes Critical severity to PR when auto-fix enabled', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      // V-001 (Critical) → PR
      expect(createFixPR).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'V-001',
        expect.any(Object),
        expect.any(Object)
      );

      // V-002 (Medium) → Issue (not in prSeverity)
      expect(createIssueIfNotExists).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ id: 'V-002' }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('routes all to issues when auto-fix disabled', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: false,
        prSeverity: ['critical', 'high'],
      });

      expect(createFixPR).not.toHaveBeenCalled();
      expect(createIssueIfNotExists).toHaveBeenCalledTimes(2);
    });

    test('routes to PR based on custom pr-severity', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high', 'medium'],
      });

      // V-001 (Critical) → PR
      expect(createFixPR).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'V-001',
        expect.any(Object),
        expect.any(Object)
      );

      // V-002 (Medium) → also PR since medium is in prSeverity
      expect(createFixPR).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'V-002',
        expect.any(Object),
        expect.any(Object)
      );

      expect(createIssueIfNotExists).not.toHaveBeenCalled();
    });

    test('only creates issues when severity not in pr-severity', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical'],
      });

      // V-001 (Critical) → PR
      expect(createFixPR).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'V-001',
        expect.any(Object),
        expect.any(Object)
      );
      expect(createFixPR).toHaveBeenCalledTimes(1);

      // V-002 (Medium) → Issue (not in prSeverity)
      expect(createIssueIfNotExists).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ id: 'V-002' }),
        expect.any(Object),
        expect.any(Object)
      );
      expect(createIssueIfNotExists).toHaveBeenCalledTimes(1);
    });

    test('skips everything when both flags are false', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      const result = await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: false,
        autoFix: false,
        prSeverity: ['critical', 'high'],
      });

      expect(createFixPR).not.toHaveBeenCalled();
      expect(createIssueIfNotExists).not.toHaveBeenCalled();
      expect(result.issuesCreated).toHaveLength(0);
      expect(result.prsCreated).toHaveLength(0);
    });
  });

  describe('fix generation', () => {
    test('falls back to issue on low confidence fix', async () => {
      resetAnthropicMock({
        content: [{ type: 'text', text: JSON.stringify({
          confidence: 'low',
          explanation: 'Not sure about this fix',
          files: [{ path: 'src/app.js', original_content: 'old', fixed_content: 'new' }],
        })}],
        stop_reason: 'end_turn',
      });

      const agent = new RemediatorAgent('test-key', 'gh-token');

      await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      // V-001 should fall back to issue due to low confidence
      expect(createFixPR).not.toHaveBeenCalled();
      expect(createIssueIfNotExists).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    test('continues on per-vuln failure and falls back to issue', async () => {
      createFixPR.mockRejectedValueOnce(new Error('API error'));

      const agent = new RemediatorAgent('test-key', 'gh-token');

      const result = await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      // V-001 PR failed → fell back to issue, V-002 also got an issue
      expect(result.errors).toHaveLength(0);
      expect(createIssueIfNotExists).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ id: 'V-001' }),
        expect.any(Object),
        expect.any(Object)
      );
      // V-001 fallback issue + V-002 normal issue
      expect(result.issuesCreated).toHaveLength(2);
    });

    test('falls back to issue when PR creation is denied', async () => {
      createFixPR.mockRejectedValueOnce(
        new Error('GitHub Actions is not permitted to create or approve pull requests')
      );

      const agent = new RemediatorAgent('test-key', 'gh-token');

      const result = await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      const core = require('@actions/core');

      // PR creation was attempted and failed
      expect(createFixPR).toHaveBeenCalledTimes(1);
      // Warning logged about PR failure
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('PR creation failed for V-001')
      );
      // Fallback info logged
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to issue for V-001')
      );
      // Issue created as fallback for V-001
      expect(createIssueIfNotExists).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ id: 'V-001' }),
        expect.any(Object),
        expect.any(Object)
      );
      // No errors recorded — fallback handled it gracefully
      expect(result.errors).toHaveLength(0);
      expect(result.issuesCreated).toHaveLength(2);
    });

    test('PR failure without createIssues does not fallback', async () => {
      createFixPR.mockRejectedValueOnce(new Error('PR denied'));

      const agent = new RemediatorAgent('test-key', 'gh-token');

      const result = await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: false,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      // PR failed, no fallback since createIssues is false
      expect(createFixPR).toHaveBeenCalledTimes(1);
      expect(createIssueIfNotExists).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(0);
      expect(result.issuesCreated).toHaveLength(0);
    });
  });

  describe('file selection', () => {
    test('scores files by keyword relevance', () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');
      const vuln = { id: 'V-001', title: 'SQL Injection in query', description: 'User input concatenated' };
      const rec = { action: 'Use parameterized queries' };

      const files = [
        { path: 'src/db.js', content: 'function runQuery(sql) { return db.query(sql); } // handles injection prevention' },
        { path: 'src/styles.css', content: '.container { color: red; }' },
        { path: 'src/utils.js', content: 'function formatDate(d) { return d.toISOString(); }' },
      ];

      const selected = agent._selectRelevantFiles(files, vuln, rec);
      expect(selected.length).toBeGreaterThan(0);
      // db.js should rank highest due to "query", "sql", "injection" keywords in content
      expect(selected[0].path).toBe('src/db.js');
    });

    test('returns empty array for empty files', () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');
      const result = agent._selectRelevantFiles([], { id: 'V-001', title: 'test' }, null);
      expect(result).toEqual([]);
    });
  });

  describe('result tracking', () => {
    test('returns counts of created issues and PRs', async () => {
      const agent = new RemediatorAgent('test-key', 'gh-token');

      const result = await agent.remediate({
        threatModel: baseThreatModel,
        systemContext: {},
        scannedFiles,
        createIssues: true,
        autoFix: true,
        prSeverity: ['critical', 'high'],
      });

      expect(result.issuesCreated.length).toBeGreaterThanOrEqual(1);
      expect(result.prsCreated.length).toBeGreaterThanOrEqual(1);
      expect(result.errors).toHaveLength(0);
    });
  });
});
