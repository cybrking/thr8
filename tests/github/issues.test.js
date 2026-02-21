const {
  createIssueIfNotExists,
  findExistingIssue,
  buildIssueBody,
  buildMarker,
  severityLabel,
} = require('../../src/github/issues');

describe('issues', () => {
  const vuln = {
    id: 'V-001',
    title: 'SQL Injection in user query',
    description: 'User input is concatenated into SQL query without sanitization',
    severity: 'High',
  };

  const risk = {
    pasta_level: 'High',
    business_impact: 'Data breach of user records',
    mitigation_complexity: 'Low',
  };

  const recommendation = {
    priority: 'Immediate',
    action: 'Use parameterized queries for all database operations',
  };

  describe('buildMarker', () => {
    test('builds dedup marker from vuln ID', () => {
      expect(buildMarker('V-001')).toBe('<!-- thr8:V-001 -->');
    });
  });

  describe('severityLabel', () => {
    test('maps severity to lowercase label', () => {
      expect(severityLabel('High')).toBe('severity:high');
      expect(severityLabel('Critical')).toBe('severity:critical');
    });

    test('defaults to medium for missing severity', () => {
      expect(severityLabel(undefined)).toBe('severity:medium');
    });
  });

  describe('buildIssueBody', () => {
    test('includes dedup marker', () => {
      const body = buildIssueBody(vuln, risk, recommendation);
      expect(body).toContain('<!-- thr8:V-001 -->');
    });

    test('includes severity and risk info', () => {
      const body = buildIssueBody(vuln, risk, recommendation);
      expect(body).toContain('**Severity:** High');
      expect(body).toContain('**Risk Level:** High');
      expect(body).toContain('**Business Impact:** Data breach of user records');
    });

    test('includes recommended action', () => {
      const body = buildIssueBody(vuln, risk, recommendation);
      expect(body).toContain('Use parameterized queries');
    });

    test('works without risk or recommendation', () => {
      const body = buildIssueBody(vuln, null, null);
      expect(body).toContain('<!-- thr8:V-001 -->');
      expect(body).toContain('**Severity:** High');
      expect(body).not.toContain('Risk Level');
    });
  });

  describe('findExistingIssue', () => {
    test('returns matching issue from search API', async () => {
      const existingIssue = { number: 42, title: '[thr8] SQL Injection' };
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockResolvedValue({
              data: { items: [existingIssue] },
            }),
          },
          issues: {
            listForRepo: jest.fn(),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await findExistingIssue(octokit, context, 'V-001');
      expect(result).toEqual(existingIssue);
      expect(octokit.rest.issues.listForRepo).not.toHaveBeenCalled();
    });

    test('falls back to listing when search fails', async () => {
      const existingIssue = {
        number: 42,
        body: 'Some content\n<!-- thr8:V-001 -->\nMore content',
      };
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockRejectedValue(new Error('Not available')),
          },
          issues: {
            listForRepo: jest.fn().mockResolvedValue({
              data: [existingIssue],
            }),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await findExistingIssue(octokit, context, 'V-001');
      expect(result).toEqual(existingIssue);
    });

    test('returns null when no match found', async () => {
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockResolvedValue({
              data: { items: [] },
            }),
          },
          issues: {
            listForRepo: jest.fn(),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await findExistingIssue(octokit, context, 'V-999');
      expect(result).toBeNull();
    });
  });

  describe('createIssueIfNotExists', () => {
    test('creates issue when none exists', async () => {
      const createdIssue = { number: 1, title: '[thr8] SQL Injection (High)' };
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockResolvedValue({ data: { items: [] } }),
          },
          issues: {
            listForRepo: jest.fn(),
            getLabel: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({ data: createdIssue }),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await createIssueIfNotExists(octokit, context, vuln, risk, recommendation);
      expect(result.created).toBe(true);
      expect(result.issue).toEqual(createdIssue);
      expect(octokit.rest.issues.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '[thr8] SQL Injection in user query (High)',
          labels: ['threat-model', 'severity:high'],
        })
      );
    });

    test('skips creation when issue already exists', async () => {
      const existingIssue = { number: 42, title: '[thr8] SQL Injection' };
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockResolvedValue({
              data: { items: [existingIssue] },
            }),
          },
          issues: {
            create: jest.fn(),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await createIssueIfNotExists(octokit, context, vuln, risk, recommendation);
      expect(result.created).toBe(false);
      expect(result.issue).toEqual(existingIssue);
      expect(octokit.rest.issues.create).not.toHaveBeenCalled();
    });

    test('creates labels when they do not exist', async () => {
      const octokit = {
        rest: {
          search: {
            issuesAndPullRequests: jest.fn().mockResolvedValue({ data: { items: [] } }),
          },
          issues: {
            getLabel: jest.fn().mockRejectedValue(new Error('Not found')),
            createLabel: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({ data: { number: 1 } }),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      await createIssueIfNotExists(octokit, context, vuln, risk, recommendation);
      expect(octokit.rest.issues.createLabel).toHaveBeenCalledTimes(2);
    });
  });
});
