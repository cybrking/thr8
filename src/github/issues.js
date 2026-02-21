const MARKER_PREFIX = '<!-- thr8:';
const MARKER_SUFFIX = ' -->';

function buildMarker(vulnId) {
  return `${MARKER_PREFIX}${vulnId}${MARKER_SUFFIX}`;
}

function buildIssueBody(vuln, risk, recommendation) {
  const lines = [
    buildMarker(vuln.id),
    '',
    `**Severity:** ${vuln.severity}`,
  ];

  if (risk) {
    lines.push(`**Risk Level:** ${risk.pasta_level}`);
    lines.push(`**Business Impact:** ${risk.business_impact}`);
    if (risk.mitigation_complexity) {
      lines.push(`**Fix Complexity:** ${risk.mitigation_complexity}`);
    }
  }

  lines.push('', '---', '', '### Description', '', vuln.description || vuln.title);

  if (recommendation) {
    lines.push('', '### Recommended Action', '', recommendation.action);
  }

  return lines.join('\n');
}

async function findExistingIssue(octokit, context, vulnId) {
  const { owner, repo } = context.repo;
  const marker = buildMarker(vulnId);

  // Try search API first
  try {
    const q = `repo:${owner}/${repo} is:issue "${marker}" in:body`;
    const { data } = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 1 });
    if (data.items.length > 0) {
      return data.items[0];
    }
  } catch {
    // Search API may be unavailable (e.g. in GHES), fall back to listing
  }

  // Fallback: list open issues and scan bodies
  try {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'threat-model',
      per_page: 100,
    });
    return issues.find(i => i.body && i.body.includes(marker)) || null;
  } catch {
    return null;
  }
}

function severityLabel(severity) {
  const level = (severity || 'medium').toLowerCase();
  return `severity:${level}`;
}

async function createIssueIfNotExists(octokit, context, vuln, risk, recommendation) {
  const { owner, repo } = context.repo;

  const existing = await findExistingIssue(octokit, context, vuln.id);
  if (existing) {
    return { created: false, issue: existing };
  }

  const labels = ['threat-model', severityLabel(vuln.severity)];

  // Ensure labels exist
  for (const label of labels) {
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: label });
    } catch {
      try {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label,
          color: label.startsWith('severity:') ? 'e11d48' : '6366f1',
        });
      } catch {
        // Label may already exist from a race condition
      }
    }
  }

  const title = `[thr8] ${vuln.title} (${vuln.severity})`;
  const body = buildIssueBody(vuln, risk, recommendation);

  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return { created: true, issue };
}

module.exports = {
  createIssueIfNotExists,
  findExistingIssue,
  buildIssueBody,
  buildMarker,
  severityLabel,
};
