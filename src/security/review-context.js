const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_CONTEXT = 40000;
const MAX_DIFF = 60000;

function readContextFile(repoPath, input) {
  if (!input) return null;
  const root = fs.realpathSync(repoPath);
  const resolved = fs.realpathSync(path.resolve(root, input));
  if (!resolved.startsWith(root + path.sep)) throw new Error('Context file must be inside the repository');
  const text = fs.readFileSync(resolved, 'utf8');
  if (!text.trim()) throw new Error(`Context file is empty: ${input}`);
  if (text.length > MAX_CONTEXT) throw new Error(`Context file exceeds ${MAX_CONTEXT} characters: ${input}`);
  return text;
}

function loadReviewContext(repoPath, { featureSpec, securityModel, baseRef, headRef = 'HEAD' } = {}) {
  const context = {
    featureSpec: readContextFile(repoPath, featureSpec),
    securityModel: readContextFile(repoPath, securityModel),
    changedFiles: [],
    diff: null,
    omissions: [],
  };
  if (!baseRef) return context;
  const git = args => execFileSync('git', args, {
    cwd: repoPath, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  // Resolve user refs to SHAs before passing them to diff; no shell interpolation.
  const resolve = ref => git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  context.baseCommit = resolve(baseRef);
  context.headCommit = resolve(headRef);
  context.mergeBase = git(['merge-base', context.baseCommit, context.headCommit]).trim();
  const checkout = resolve('HEAD');
  if (checkout !== context.headCommit || git(['status', '--porcelain', '--untracked-files=no']).trim()) {
    throw new Error('Diff review requires a clean tracked checkout at head-ref');
  }
  context.trackedFiles = git(['ls-files', '-z']).split('\0').filter(Boolean);
  context.changedFiles = git(['diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z', context.mergeBase, context.headCommit, '--'])
    .split('\0').filter(Boolean);
  const diff = git(['diff', '--no-ext-diff', '--no-textconv', '--unified=20', context.mergeBase, context.headCommit, '--']);
  context.diff = diff.slice(0, MAX_DIFF);
  if (diff.length > MAX_DIFF) context.omissions.push('Git diff truncated at 60000 characters');
  context.mode = 'change-review';
  return context;
}

module.exports = { loadReviewContext, readContextFile };
