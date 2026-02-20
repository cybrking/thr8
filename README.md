# thr8 — PASTA Threat Model Generator

[![GitHub Action](https://img.shields.io/badge/GitHub_Action-PASTA_Threat_Model-red?logo=github-actions&logoColor=white)](https://github.com/marketplace/actions/pasta-threat-model-generator)

A GitHub Action that automatically generates PASTA (Process for Attack Simulation and Threat Analysis) threat models by analyzing your repository's code, infrastructure, and dependencies. Uses static analysis for discovery and Claude AI for intelligent threat reasoning.

## Features

- **Automatic codebase scanning** — Detects languages, frameworks, databases, auth mechanisms, and security controls
- **Infrastructure analysis** — Parses Terraform, Docker Compose, and Kubernetes configurations
- **API surface mapping** — Discovers endpoints, authentication requirements, and sensitive data handling
- **PASTA threat modeling** — Full 7-stage framework: business objectives, attack surfaces, kill chains, and risk analysis
- **Multiple output formats** — Markdown (with Mermaid diagrams), JSON, HTML, and optional PDF
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
    steps:
      - uses: actions/checkout@v4

      - name: Generate Threat Model
        uses: cybrking/thr8@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}

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

## Outputs

| Output | Description |
|--------|-------------|
| `threats-found` | Total number of vulnerabilities identified |
| `high-risk-count` | Number of critical-risk vulnerabilities |
| `report-path` | Path to the generated report directory |

## How It Works

The action runs a 3-stage pipeline:

```
  Discovery (Static)           Reasoning (Claude AI)           Output
┌─────────────────────┐      ┌──────────────────────┐      ┌──────────┐
│                     │      │ Business Objectives   │      │ Markdown │
│  Codebase Scanner   │─────>│ Attack Surfaces       │─────>│ JSON     │
│                     │      │ Kill Chain Scenarios   │      │ HTML     │
│ • Tech stack        │      │ Risk Analysis         │      │ PDF      │
│ • Infrastructure    │      │ Recommendations       │      │          │
│ • API endpoints     │      │                       │      │          │
│ • Data flows        │      │ (3 focused API calls)  │      │          │
└─────────────────────┘      └──────────────────────┘      └──────────┘
```

**Stage 1 — Discovery** scans your repository using static analysis (no API calls) to collect tech stack, infrastructure, API endpoints, and data flow context.

**Stage 2 — Reasoning** sends the collected context to Claude for PASTA analysis: identifying business objectives, mapping attack surfaces, generating realistic attack scenarios (kill chains), and scoring risks.

**Stage 3 — Output** renders the analysis into your chosen formats using Handlebars templates with Mermaid diagrams for data flow visualization.

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

The action makes **3 Claude API calls** per run using `claude-sonnet-4-6`:

- Typical input: ~2–5K tokens per call
- Typical output: ~3–8K tokens per call
- **Estimated cost: $0.05–0.15 per run**

## Development

```bash
npm install        # Install dependencies
npm test           # Run tests with coverage
npm run build      # Bundle for distribution (dist/index.js)
```

## License

MIT
