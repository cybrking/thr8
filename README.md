# thr8 — PASTA Threat Model Generator

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-PASTA_Threat_Model-red?logo=github-actions&logoColor=white)](https://github.com/marketplace/actions/pasta-threat-model-generator)

A GitHub Action that automatically generates PASTA (Process for Attack Simulation and Threat Analysis) threat models by analyzing your repository's code, infrastructure, and dependencies. Collects source files and uses Claude for system discovery, data-flow inference and threat reasoning. Also includes a Claude Code plugin for reviewed security context and feature/diff reviews.

## Features

- **Automatic codebase scanning** — Detects languages, frameworks, databases, auth mechanisms, and security controls
- **Infrastructure analysis** — Parses Terraform, Docker Compose, and Kubernetes configurations
- **API surface mapping** — Discovers endpoints, authentication requirements, and sensitive data handling
- **PASTA threat modeling** — Full 7-stage framework: business objectives, attack surfaces, kill chains, and risk analysis
- **Multiple output formats** — Markdown (with Mermaid diagrams), JSON, HTML, and optional PDF
- **Automated remediation** — Creates GitHub Issues for findings and AI-generated fix PRs for critical vulnerabilities
- **CI/CD integration** — Fail builds on critical-risk findings, upload reports as artifacts

## Claude Code workflow

thr8 maintains reviewed security context and applies it to proposed software changes. Start with these commands inside a target repository:

```bash
# Clone thr8 elsewhere, then launch Claude Code from the repository to review:
claude --plugin-dir /absolute/path/to/thr8/plugins/thr8
```

```text
/thr8:threat-model
/thr8:review main
/thr8:review External collaborators can mention eligible thread participants
```

`/thr8:threat-model` drafts or updates `security/threat-model.md` with code citations, assets, boundaries, control scope, uncertainties and threat decisions. Human review establishes approved assumptions; generated content stays draft. `/thr8:review` reads that file and feature/diff context, traces surrounding code, and saves `security/reviews/<head>-review.md` with attacker prerequisites, evidence, required security outcomes and proposed negative tests. Review proposes changes to existing decisions without silently replacing human approvals. Version those files with the application.

To share through the repository's plugin marketplace after these changes are available on the default branch:

```text
/plugin marketplace add cybrking/thr8
/plugin install thr8@thr8-tools
```

Plugin structure and local loading follow the [Claude Code plugin documentation](https://code.claude.com/docs/en/plugins). A [starter template](plugins/thr8/templates/threat-model.md) is bundled; [thr8's own context](security/threat-model.md) is an initial draft, not an approved security policy.

This first version tracks decisions in a human-reviewed Markdown ledger. It does not automatically reconcile threat history in CI or prove that a suggested mitigation works. Negative tests are proposals, not executed verification. Model quality must be evaluated on vulnerable and corrected changes before relying on detection coverage.

## Assessment integrity and change review in CI

Scanner/model API errors and malformed responses fail the Action without publishing a zero threat count. Counts are derived from validated vulnerabilities. Feature/context/diff reviews require exact source citations plus attacker prerequisites, assumptions, control scope, a security requirement and a negative-test proposal. Citation validation establishes that the quoted source exists; it does not establish that the security interpretation is correct.

Reports include mode, commits and scanner coverage. Files are capped at 8,000 characters and the total source budget is 120,000 characters; diffs are capped at 60,000 characters. Source truncation, budget exclusions, unreadable content and existing changed files outside scanner scope mark the assessment incomplete, fail the job and disable issue/fix creation. Intentionally excluded dependencies, generated files, symlinks and hidden directories other than `.github` remain outside the declared scope. A complete result means analysis completed within that scope, not that the repository is secure. Large repositories, including large lockfiles, can need a narrower pilot scope or future retrieval improvements.

Explicit context/findings files must be nonempty, at most 40,000 characters each, and resolve inside the repository. A requested unreadable context fails; it is never silently omitted. Diff mode uses tracked head files only, resolves refs to commits, and requires a clean tracked checkout at head. Fetch the base and head history; missing refs fail. Deleted source is visible in the diff, but evidence citations are currently validated against head source only.

For PRs, review the actual head commit rather than GitHub's synthetic merge checkout. Once these changes are merged, use the new inputs like this (pin the Action itself to a reviewed commit SHA in production):

```yaml
on: pull_request
permissions:
  contents: read
jobs:
  change-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: cybrking/thr8@main
        id: review
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          security-model: security/threat-model.md
          feature-spec: docs/feature.md
          base-ref: ${{ github.event.pull_request.base.sha }}
          head-ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: thr8-review
          path: threat-model/
```

Keep the referenced context/spec files in the application repository. Fork PRs normally cannot access the API secret; enable this job only where that secret is available. Keep code review on `pull_request`, with remediation disabled by default.

## Quick Start

```yaml
name: Threat Model
on:
  push:
    branches: [main]
  pull_request:

jobs:
  threat-model:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Threat Model
        uses: cybrking/thr8@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          create-issues: 'true'
          auto-fix: 'true'

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: threat-model
          path: threat-model/
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic-api-key` | Yes | — | Anthropic API key for Claude-powered analysis |
| `output-formats` | No | `markdown,json,html` | Comma-separated output formats (`markdown`, `json`, `html`, `pdf`) |
| `fail-on-high-risk` | No | `false` | Fail the build if critical-risk vulnerabilities are found |
| `config-path` | No | `.threat-model.yml` | Path to optional configuration file |
| `github-token` | No | — | GitHub token for creating issues and PRs (enables remediation) |
| `create-issues` | No | `false` | Create GitHub Issues for medium/low findings |
| `auto-fix` | No | `false` | Generate AI fix PRs for critical/immediate findings |
| `feature-spec` | No | — | Repository-relative path to feature requirements |
| `security-model` | No | — | Repository-relative path to reviewed security context |
| `base-ref` | No | — | Git base ref; review uses its merge base with head |
| `head-ref` | No | `HEAD` | Head Git ref; checkout must match it with no tracked edits |
| `security-findings` | No | — | Repository-contained file of candidate findings; checked against source |
| `pr-severity` | No | `critical,high` | Comma-separated severity levels that get fix PRs when auto-fix is enabled |

## Outputs

| Output | Description |
|--------|-------------|
| `assessment-status` | `complete` within declared scope, `incomplete` for coverage omissions, or `failed` for input/analysis errors |
| `threats-found` | Total number of vulnerabilities identified |
| `high-risk-count` | Number of critical-risk vulnerabilities |
| `report-path` | Path to the generated report directory |
| `issues-created` | Number of GitHub Issues created |
| `prs-created` | Number of fix PRs created |

## How It Works

The action runs a 4-stage pipeline:

```
  Discovery (Claude)           Reasoning (Claude AI)           Output            Remediation
┌─────────────────────┐      ┌──────────────────────┐      ┌──────────┐      ┌──────────────┐
│                     │      │ Business Objectives   │      │ Markdown │      │ GitHub Issues│
│  Codebase Scanner   │─────>│ Attack Surfaces       │─────>│ JSON     │─────>│ Fix PRs      │
│                     │      │ Kill Chain Scenarios   │      │ HTML     │      │              │
│ • Tech stack        │      │ Risk Analysis         │      │ PDF      │      │ (optional)   │
│ • Infrastructure    │      │ Recommendations       │      │          │      │              │
│ • API endpoints     │      │                       │      │          │      │              │
│ • Data flows        │      │ (2 calls + continuations)  │      │          │      │              │
└─────────────────────┘      └──────────────────────┘      └──────────┘      └──────────────┘
```

**Stage 1 — Discovery** collects recognized source/configuration files, then asks Claude to infer the tech stack, infrastructure, API endpoints and data flows from that source. This is model-driven analysis, not a deterministic static analyzer.

**Stage 2 — Reasoning** sends the collected context to Claude for PASTA analysis: identifying business objectives, mapping attack surfaces, generating realistic attack scenarios (kill chains), and scoring risks.

**Stage 3 — Output** renders the analysis into your chosen formats using Handlebars templates with Mermaid diagrams for data flow visualization.

**Stage 4 — Remediation** (optional) automatically creates GitHub Issues for findings and AI-generated fix PRs for critical vulnerabilities. See [Automated Remediation](#automated-remediation) below.

## PASTA Framework Coverage

The generated report covers all 7 stages of PASTA:

| Stage | Name | What It Covers |
|-------|------|----------------|
| 1 | Business Objectives | Why the system matters, impact of breach |
| 2 | Technical Scope | Tech stack, infrastructure, data classification |
| 3 | Application Decomposition | Data flow diagrams across trust boundaries |
| 4 | Threat Analysis | Attack surfaces and threat vectors |
| 5 | Vulnerability Analysis | Specific weaknesses with severity ratings |
| 6 | Attack Modeling | Realistic kill chain scenarios (Recon → Exploitation → Exfiltration) |
| 7 | Risk & Impact Analysis | Business risk scoring with tactical recommendations |

## Output Formats

### Markdown (`THREAT_MODEL.md`)
Human-readable report with Mermaid data flow diagrams, threat matrices, and recommendation tables. Renders natively on GitHub.

### JSON (`threat-model.json`)
Machine-readable structured output for CI/CD integration, custom dashboards, or downstream tooling.

```json
{
  "generated": "2026-02-19T21:10:15.070Z",
  "projectName": "org/repo",
  "threatModel": {
    "overall_risk_status": "MEDIUM",
    "summary": {
      "total_vulnerabilities": 5,
      "critical": 0,
      "high": 2,
      "medium": 2,
      "low": 1
    }
  }
}
```

### HTML (`THREAT_MODEL.html`)
Professional stakeholder-facing report with sidebar navigation, executive summary dashboard, color-coded severity levels, and embedded data flow diagrams. Print-friendly.

### PDF (`THREAT_MODEL.pdf`)
Generated from the HTML report via headless Chrome. Requires Chrome/Chromium on the runner — gracefully skips if unavailable.

## Automated Remediation

When you provide a `github-token`, the action can automatically act on its findings instead of just reporting them.

### How to enable

Add three inputs to your workflow step:

```yaml
- name: Generate Threat Model
  uses: cybrking/thr8@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    create-issues: 'true'
    auto-fix: 'true'
```

Your job also needs these permissions:

```yaml
permissions:
  contents: write       # create branches and commit fixes
  pull-requests: write  # open fix PRs
  issues: write         # create issues and labels
```

> **Repository setting**: If using `auto-fix`, you must also enable **"Allow GitHub Actions to create and approve pull requests"** in your repo under **Settings → Actions → General → Workflow permissions**. If this setting is off, the action falls back to creating issues instead.

### What each flag does

| Flag | What happens |
|------|-------------|
| `create-issues: 'true'` | Creates a GitHub Issue for every finding that isn't handled by a fix PR. Issues include severity labels (`threat-model`, `severity:high`, etc.), business impact, and recommended action. |
| `auto-fix: 'true'` | For findings whose severity is in the `pr-severity` list, Claude generates a minimal targeted code fix and opens a PR on a `thr8/fix-{vuln-id}` branch. If the fix has low confidence, it falls back to creating an issue instead. |
| `pr-severity: 'critical,high'` | Controls which severity levels get fix PRs (default: `critical,high`). Set to `critical,high,medium` to also auto-fix medium findings, or `critical` to limit PRs to only critical vulnerabilities. |

Both flags require `github-token` to be set. Without a token, remediation is skipped entirely (the action still generates reports as usual).

### Automatic fix scope and new-file policy

Each fix is limited to the up to eight eligible source/config files selected for that vulnerability and supplied to the fix model. The write boundary independently checks the complete response against those exact paths; model-provided scope cannot expand them. Malformed, duplicate, noncanonical or out-of-scope paths reject the whole fix before any branch or file write.

Automatic fixes exclude hidden paths (including GitHub workflows, Git metadata and credential configuration), ownership/CI/Action definitions, and common credential, private-key and Terraform state filenames. The scanner's `.env.example`, `.env.sample`, `.eslintrc.json` and `.eslintrc.js` files remain eligible, along with ordinary application code and infrastructure configuration. These path rules do not prove that file contents are safe; generated changes still need human review.

**New files are not permitted.** Every target must already be a regular file in the pinned default-branch base, including executable source files. Symlinks, submodules, missing files and failed/incomplete base lookups reject the whole fix. This also prevents automatic fixes to files that exist only on a feature branch. Fixes requiring protected paths or new files must be applied manually; rejected fixes fall back to an issue when `create-issues` is enabled.

### Deduplication

Re-running the action does **not** create duplicates. Each issue and PR body contains a hidden marker (`<!-- thr8:V-001 -->`) that is checked before creating anything new.

### Routing logic

```
For each vulnerability found:

  Is auto-fix enabled AND severity is in pr-severity list?
    ├─ YES → Generate fix with Claude
    │         ├─ High/medium confidence → Open fix PR
    │         └─ Low confidence → Fall back to issue (if create-issues enabled)
    └─ NO  → Create GitHub Issue (if create-issues enabled)
```

### Issue format

Issues are created with the title `[thr8] {vulnerability title} ({severity})` and labeled `threat-model` + `severity:{level}`. The body includes:
- Severity and risk level
- Business impact assessment
- Recommended remediation action

### PR format

Fix PRs are created on a `thr8/fix-{vuln-id}` branch with:
- The minimal code change needed to address the vulnerability
- An explanation of what was fixed
- Risk context (severity, business impact)
- A list of changed files

### Issues-only mode

If you want tracking without automated code changes, enable only issues:

```yaml
with:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  create-issues: 'true'
  auto-fix: 'false'     # no PRs, just issues
```

## Examples

### Fail build on critical findings

```yaml
- name: Generate Threat Model
  uses: cybrking/thr8@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    fail-on-high-risk: 'true'
```

### Generate only JSON for CI/CD pipelines

```yaml
- name: Generate Threat Model
  uses: cybrking/thr8@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    output-formats: 'json'
```

### Auto-remediate findings

```yaml
jobs:
  threat-model:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Threat Model
        id: threat-model
        uses: cybrking/thr8@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          create-issues: 'true'
          auto-fix: 'true'
          pr-severity: 'critical,high'

      - name: Remediation Summary
        run: |
          echo "Issues created: ${{ steps.threat-model.outputs.issues-created }}"
          echo "Fix PRs created: ${{ steps.threat-model.outputs.prs-created }}"
```

### Post summary as PR comment

```yaml
- name: Generate Threat Model
  id: threat-model
  uses: cybrking/thr8@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Comment on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      const report = fs.readFileSync('threat-model/THREAT_MODEL.md', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: report
      });
```

## Supported Tech Stacks

The codebase scanner automatically detects:

| Category | Examples |
|----------|----------|
| **Languages** | JavaScript, TypeScript, Python, Go, Java, Ruby |
| **Frameworks** | Express, Django, Rails, FastAPI, Spring Boot, Next.js |
| **Databases** | PostgreSQL, MySQL, MongoDB, Redis, DynamoDB |
| **Infrastructure** | Terraform, Docker, Docker Compose, Kubernetes |
| **Auth** | JWT, OAuth, session-based, API keys |
| **Cloud** | AWS, GCP, Azure resource detection |

## Cost

The Action makes two initial Claude API calls using `claude-sonnet-4-6`: discovery and threat generation. Long responses can require continuation calls. Remediation adds a call per attempted fix. Cost depends on source/diff size, response length and current Anthropic pricing; the Action now passes source evidence into reasoning as well as discovery.

The Claude Code plugin uses your configured Claude Code access and does not require a separate Anthropic API key. Its token usage follows your Claude Code plan.

## Development

```bash
npm install        # Install dependencies
npm test           # Run tests with coverage
npm run build      # Bundle for distribution (dist/index.js)
```

## License

MIT
