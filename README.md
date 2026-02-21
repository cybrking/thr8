# thr8 — PASTA Threat Model Generator

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-PASTA_Threat_Model-red?logo=github-actions&logoColor=white)](https://github.com/marketplace/actions/pasta-threat-model-generator)

A GitHub Action that automatically generates PASTA (Process for Attack Simulation and Threat Analysis) threat models by analyzing your repository's code, infrastructure, and dependencies. Uses static analysis for discovery and Claude AI for intelligent threat reasoning.

## Features

- **Automatic codebase scanning** — Detects languages, frameworks, databases, auth mechanisms, and security controls
- **Infrastructure analysis** — Parses Terraform, Docker Compose, and Kubernetes configurations
- **API surface mapping** — Discovers endpoints, authentication requirements, and sensitive data handling
- **PASTA threat modeling** — Full 7-stage framework: business objectives, attack surfaces, kill chains, and risk analysis
- **Multiple output formats** — Markdown (with Mermaid diagrams), JSON, HTML, and optional PDF
- **Automated remediation** — Creates GitHub Issues for findings and AI-generated fix PRs for critical vulnerabilities
- **CI/CD integration** — Fail builds on critical-risk findings, upload reports as artifacts

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
| `pr-severity` | No | `critical,high` | Comma-separated severity levels that get fix PRs when auto-fix is enabled |

## Outputs

| Output | Description |
|--------|-------------|
| `threats-found` | Total number of vulnerabilities identified |
| `high-risk-count` | Number of critical-risk vulnerabilities |
| `report-path` | Path to the generated report directory |
| `issues-created` | Number of GitHub Issues created |
| `prs-created` | Number of fix PRs created |

## How It Works

The action runs a 4-stage pipeline:

```
  Discovery (Static)           Reasoning (Claude AI)           Output            Remediation
┌─────────────────────┐      ┌──────────────────────┐      ┌──────────┐      ┌──────────────┐
│                     │      │ Business Objectives   │      │ Markdown │      │ GitHub Issues│
│  Codebase Scanner   │─────>│ Attack Surfaces       │─────>│ JSON     │─────>│ Fix PRs      │
│                     │      │ Kill Chain Scenarios   │      │ HTML     │      │              │
│ • Tech stack        │      │ Risk Analysis         │      │ PDF      │      │ (optional)   │
│ • Infrastructure    │      │ Recommendations       │      │          │      │              │
│ • API endpoints     │      │                       │      │          │      │              │
│ • Data flows        │      │ (3 focused API calls)  │      │          │      │              │
└─────────────────────┘      └──────────────────────┘      └──────────┘      └──────────────┘
```

**Stage 1 — Discovery** scans your repository using static analysis (no API calls) to collect tech stack, infrastructure, API endpoints, and data flow context.

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

The action makes **3 Claude API calls** per run using `claude-sonnet-4-6` for threat analysis:

- Typical input: ~2–5K tokens per call
- Typical output: ~3–8K tokens per call
- **Estimated cost: $0.05–0.15 per run** (analysis only)

With `auto-fix` enabled, an additional API call is made per critical/high vulnerability to generate fix code. Each fix call uses ~2–4K input tokens and ~2–4K output tokens. For a typical repo with 1–3 critical findings, this adds ~$0.02–0.06 per run.

## Development

```bash
npm install        # Install dependencies
npm test           # Run tests with coverage
npm run build      # Bundle for distribution (dist/index.js)
```

## License

MIT
