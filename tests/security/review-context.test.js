const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadReviewContext, readContextFile } = require('../../src/security/review-context');
let repo;
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'thr8-context-'));
  git(['init', '-q']); git(['config', 'user.email', 'test@example.com']); git(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repo, 'route.js'), 'return participants;\n');
  git(['add', '.']); git(['commit', '-qm', 'base']);
});
afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));
test('loads requirements and reviews merge-base changes with exact commits', () => {
  const base = git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'route.js'), 'return workspaceUsers;\n');
  git(['add', '.']); git(['commit', '-qm', 'feature']);
  fs.writeFileSync(path.join(repo, 'feature.md'), 'Guests can mention thread participants');
  const context = loadReviewContext(repo, { baseRef: base, featureSpec: 'feature.md' });
  expect(context.changedFiles).toEqual(['route.js']);
  expect(context.diff).toContain('+return workspaceUsers;');
  expect(context.baseCommit).toBe(base); expect(context.mergeBase).toBe(base);
  expect(context.featureSpec).toContain('Guests');
});
test('rejects stale/dirty checkouts and invalid refs', () => {
  fs.writeFileSync(path.join(repo, 'route.js'), 'dirty');
  expect(() => loadReviewContext(repo, { baseRef: 'HEAD' })).toThrow('clean tracked checkout');
  expect(() => loadReviewContext(repo, { baseRef: '--help' })).toThrow();
});
test('rejects missing, empty, excessive and escaped context files', () => {
  expect(() => readContextFile(repo, 'missing.md')).toThrow();
  fs.writeFileSync(path.join(repo, 'context.md'), '');
  expect(() => readContextFile(repo, 'context.md')).toThrow('empty');
  fs.writeFileSync(path.join(repo, 'context.md'), 'x'.repeat(40001));
  expect(() => readContextFile(repo, 'context.md')).toThrow('exceeds');
  fs.symlinkSync('/etc/hosts', path.join(repo, 'external'));
  expect(() => readContextFile(repo, 'external')).toThrow('inside the repository');
});
