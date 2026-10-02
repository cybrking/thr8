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
            getTree: jest.fn().mockImplementation(({ tree_sha }) => Promise.resolve({
              data: { tree: tree_sha === 'base-sha-123'
                ? [{ path: 'src', type: 'tree', mode: '040000', sha: 'src-tree' }]
                : [{ path: 'db.js', type: 'blob', mode: '100644', sha: 'abc123' },
                  { path: 'app.js', type: 'blob', mode: '100755', sha: 'app-sha' }] },
            })),
            createRef: jest.fn().mockResolvedValue({}),
            updateRef: jest.fn().mockResolvedValue({}),
          },
        },
      };
    }

    const context = { repo: { owner: 'test-owner', repo: 'test-repo' } };

    test('creates branch, commits files, and opens PR', async () => {
      const octokit = makeOctokit();

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']);
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

    test('rejects a generated path outside the selected scope before any writes', async () => {
      const octokit = makeOctokit();
      const unrelatedFix = { ...fixData, files: [{ path: 'src/unrelated.js', fixed_content: 'changed' }] };

      await expect(createFixPR(octokit, context, 'V-001', unrelatedFix, risk, ['src/db.js']))
        .rejects.toThrow(/scope/);
      expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(octokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
    });

    function expectNoWrites(octokit) {
      expect(octokit.rest.git.createRef).not.toHaveBeenCalled();
      expect(octokit.rest.git.updateRef).not.toHaveBeenCalled();
      expect(octokit.rest.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
      expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
    }

    test.each([
      undefined, [], ['.github/workflows/ci.yml'], ['../src/db.js'],
    ])('fails closed for missing or invalid caller scope %j', async scope => {
      const octokit = makeOctokit();
      await expect(createFixPR(octokit, context, 'V-001', fixData, risk, scope))
        .rejects.toThrow(/scope/);
      expectNoWrites(octokit);
    });

    test.each([
      undefined, null, {}, { files: null }, { files: 'src/db.js' }, { files: [] },
      { files: [null] }, { files: [{ path: 'src/db.js', fixed_content: null }] },
      { files: [{ path: 42, fixed_content: 'new' }] },
      { files: [{ path: 'src/db.js', fixed_content: {} }] },
      { files: [fixData.files[0], fixData.files[0]] },
    ])('rejects malformed plans before any writes: %j', async plan => {
      const octokit = makeOctokit();
      await expect(createFixPR(octokit, context, 'V-001', plan, risk, ['src/db.js']))
        .rejects.toThrow();
      expectNoWrites(octokit);
    });

    test.each([
      '.github/workflows/ci.yml', '.env.production', 'config/credentials.json',
      'CODEOWNERS', 'action.yml', 'src/../db.js', '/src/db.js', './src/db.js',
      'src//db.js', 'src/%2e%2e/db.js', 'src/db.js/', 'src\\db.js', 'SRC/db.js',
      'src/db.js\n', 'src/\u0000db.js', 'C:/src/db.js',
    ])('rejects an unsafe second path without partially applying the plan: %s', async badPath => {
      const octokit = makeOctokit();
      const plan = { ...fixData, files: [...fixData.files, { path: badPath, fixed_content: 'bad' }] };
      await expect(createFixPR(octokit, context, 'V-001', plan, risk, ['src/db.js']))
        .rejects.toThrow(/scope/);
      expectNoWrites(octokit);
    });

    test.each([
      ['missing file', null],
      ['symlink', { path: 'app.js', type: 'blob', mode: '120000', sha: 'link-sha' }],
      ['submodule', { path: 'app.js', type: 'commit', mode: '160000', sha: 'submodule-sha' }],
      ['directory', { path: 'app.js', type: 'tree', mode: '040000', sha: 'directory-sha' }],
      ['missing SHA', { path: 'app.js', type: 'blob', mode: '100644' }],
    ])('rejects %s at the base before any writes', async (_, entry) => {
      const octokit = makeOctokit();
      octokit.rest.git.getTree
        .mockResolvedValueOnce({ data: { tree: [{ path: 'src', type: 'tree', mode: '040000', sha: 'src-tree' }] } })
        .mockResolvedValueOnce({ data: { tree: [
          { path: 'db.js', type: 'blob', mode: '100644', sha: 'abc123' },
          ...(entry ? [entry] : []),
        ] } });
      const plan = { ...fixData, files: [...fixData.files, { path: 'src/app.js', fixed_content: 'new' }] };
      await expect(createFixPR(octokit, context, 'V-001', plan, risk, ['src/db.js', 'src/app.js']))
        .rejects.toThrow(/existing regular file/);
      expectNoWrites(octokit);
    });

    test.each(['120000', '160000'])('rejects a non-directory ancestor with mode %s', async mode => {
      const octokit = makeOctokit();
      octokit.rest.git.getTree.mockResolvedValue({ data: { tree: [
        { path: 'src', type: mode === '160000' ? 'commit' : 'blob', mode, sha: 'wrong-type' },
      ] } });
      await expect(createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']))
        .rejects.toThrow(/existing regular file/);
      expectNoWrites(octokit);
    });

    test.each([403, 404, 500])('does not turn base lookup error %s into file creation', async status => {
      const octokit = makeOctokit();
      octokit.rest.git.getTree.mockRejectedValue(Object.assign(new Error('lookup failed'), { status }));
      await expect(createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']))
        .rejects.toThrow('lookup failed');
      expectNoWrites(octokit);
    });

    test.each([{ truncated: true, tree: [] }, {}])('rejects an incomplete base tree: %j', async tree => {
      const octokit = makeOctokit();
      octokit.rest.git.getTree.mockResolvedValue({ data: tree });
      await expect(createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']))
        .rejects.toThrow(/Incomplete/);
      expectNoWrites(octokit);
    });

    test('preflights every file at the pinned base and preserves multi-file/empty fixes', async () => {
      const octokit = makeOctokit();
      const plan = { ...fixData, files: [...fixData.files, { path: 'src/app.js', fixed_content: '' }] };
      const result = await createFixPR(octokit, context, 'V-001', plan, risk, ['src/db.js', 'src/app.js']);
      expect(result.created).toBe(true);
      expect(octokit.rest.git.getTree).toHaveBeenNthCalledWith(1,
        { ...context.repo, tree_sha: 'base-sha-123' });
      expect(octokit.rest.git.getTree).toHaveBeenNthCalledWith(2,
        { ...context.repo, tree_sha: 'src-tree' });
      expect(octokit.rest.git.getTree).toHaveBeenCalledTimes(2);
      expect(Math.max(...octokit.rest.git.getTree.mock.invocationCallOrder))
        .toBeLessThan(octokit.rest.git.createRef.mock.invocationCallOrder[0]);
      expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
      expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ path: 'src/app.js', sha: 'app-sha', content: '' }));
      expect(octokit.rest.repos.getContent).not.toHaveBeenCalled();
    });

    test('uses a snapshot of validated files throughout asynchronous operations', async () => {
      const octokit = makeOctokit();
      const plan = { ...fixData, files: fixData.files.map(file => ({ ...file })) };
      octokit.rest.pulls.list.mockImplementation(async () => {
        plan.files[0].path = '.github/workflows/ci.yml';
        plan.files[0].fixed_content = 'unvalidated';
        return { data: [] };
      });
      await createFixPR(octokit, context, 'V-001', plan, risk, ['src/db.js']);
      expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(expect.objectContaining({
        path: 'src/db.js', content: Buffer.from(fixData.files[0].fixed_content).toString('base64'),
      }));
      expect(octokit.rest.pulls.create.mock.calls[0][0].body).not.toContain('.github');
    });

    test('skips creation when PR already exists', async () => {
      const existingPR = { number: 10, title: '[thr8] Fix V-001' };
      const octokit = makeOctokit({ existingPR });

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']);
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

      const result = await createFixPR(octokit, context, 'V-001', fixData, risk, ['src/db.js']);
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
