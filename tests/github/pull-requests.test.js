const {
  createFixPR,
  findExistingPR,
  buildPRBody,
  branchName,
} = require('../../src/github/pull-requests');

describe('pull-requests', () => {
  const fixData = {
    confidence: 'high',
    explanation: 'Added parameterized queries',
    files: [
      {
        path: 'src/db.js',
        original_content: 'db.query("SELECT * FROM users WHERE id=" + id)',
        fixed_content: 'db.query("SELECT * FROM users WHERE id=$1", [id])',
      },
    ],
    notes: 'Verify query results are unchanged',
  };

  const risk = {
    pasta_level: 'High',
    business_impact: 'Data breach',
  };

  describe('branchName', () => {
    test('creates lowercase branch name from vuln ID', () => {
      expect(branchName('V-001')).toBe('thr8/fix-v-001');
    });
  });

  describe('buildPRBody', () => {
    test('includes dedup marker', () => {
      const body = buildPRBody('V-001', fixData, risk);
      expect(body).toContain('<!-- thr8:V-001 -->');
    });

    test('includes fix explanation', () => {
      const body = buildPRBody('V-001', fixData, risk);
      expect(body).toContain('Added parameterized queries');
    });

    test('includes risk context', () => {
      const body = buildPRBody('V-001', fixData, risk);
      expect(body).toContain('**Risk Level:** High');
      expect(body).toContain('**Business Impact:** Data breach');
    });

    test('lists changed files', () => {
      const body = buildPRBody('V-001', fixData, risk);
      expect(body).toContain('`src/db.js`');
    });

    test('includes notes', () => {
      const body = buildPRBody('V-001', fixData, risk);
      expect(body).toContain('Verify query results are unchanged');
    });

    test('works without risk', () => {
      const body = buildPRBody('V-001', fixData, null);
      expect(body).toContain('<!-- thr8:V-001 -->');
      expect(body).not.toContain('Risk Context');
    });
  });

  describe('findExistingPR', () => {
    test('returns matching PR', async () => {
      const existingPR = { number: 10, title: '[thr8] Fix V-001' };
      const octokit = {
        rest: {
          pulls: {
            list: jest.fn().mockResolvedValue({ data: [existingPR] }),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await findExistingPR(octokit, context, 'V-001');
      expect(result).toEqual(existingPR);
      expect(octokit.rest.pulls.list).toHaveBeenCalledWith(
        expect.objectContaining({
          head: 'test-owner:thr8/fix-v-001',
          state: 'open',
        })
      );
    });

    test('returns null when no matching PR', async () => {
      const octokit = {
        rest: {
          pulls: {
            list: jest.fn().mockResolvedValue({ data: [] }),
          },
        },
      };
      const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

      const result = await findExistingPR(octokit, context, 'V-999');
      expect(result).toBeNull();
    });
  });

  describe('createFixPR', () => {
    function makeOctokit({ existingPR = null } = {}) {
      return {
        rest: {
          pulls: {
            list: jest.fn().mockResolvedValue({ data: existingPR ? [existingPR] : [] }),
            create: jest.fn().mockResolvedValue({
              data: { number: 5, title: '[thr8] Fix V-001', html_url: 'https://github.com/test/5' },
            }),
          },
          repos: {
            get: jest.fn().mockResolvedValue({
              data: { default_branch: 'main' },
            }),
            getContent: jest.fn().mockResolvedValue({
              data: { sha: 'abc123' },
            }),
            createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
          },
          git: {
            getRef: jest.fn().mockResolvedValue({
              data: { object: { sha: 'base-sha-123' } },
            }),
            createRef: jest.fn().mockResolvedValue({}),
          },
        },
      };
    }

    const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

    test('creates branch, commits files, and opens PR', async () => {
      const octokit = makeOctokit();

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk);
      expect(result.created).toBe(true);
      expect(result.pr.number).toBe(5);

      // Branch created
      expect(octokit.rest.git.createRef).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: 'refs/heads/thr8/fix-v-001',
          sha: 'base-sha-123',
        })
      );

      // File committed
      expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'src/db.js',
          branch: 'thr8/fix-v-001',
          sha: 'abc123',
        })
      );

      // PR opened
      expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '[thr8] Fix V-001',
          head: 'thr8/fix-v-001',
          base: 'main',
        })
      );
    });

    test('skips creation when PR already exists', async () => {
      const existingPR = { number: 10, title: '[thr8] Fix V-001' };
      const octokit = makeOctokit({ existingPR });

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk);
      expect(result.created).toBe(false);
      expect(result.pr).toEqual(existingPR);
      expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    test('handles branch already existing (422)', async () => {
      const octokit = makeOctokit();
      const error = new Error('Reference already exists');
      error.status = 422;
      octokit.rest.git.createRef.mockRejectedValue(error);
      octokit.rest.git.updateRef = jest.fn().mockResolvedValue({});

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk);
      expect(result.created).toBe(true);
      expect(octokit.rest.git.updateRef).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: 'heads/thr8/fix-v-001',
          sha: 'base-sha-123',
          force: true,
        })
      );
    });
  });
});
