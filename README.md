# Threat Model Generator

A GitHub Action that automatically generates compliance-ready threat models by analyzing your repository's code, infrastructure, and dependencies. Uses static analysis for discovery and Claude AI for intelligent threat reasoning.

## Features

- **Automatic tech stack detection** - Node.js, Python, Ruby, Go, Java ecosystems
- **Infrastructure analysis** - Terraform, Docker Compose, Kubernetes
- **API surface mapping** - Express, Django, Rails, FastAPI route detection
- **STRIDE threat modeling** - Comprehensive threat identification with risk scoring
- **Compliance mapping** - SOC2, PCI-DSS, HIPAA framework assessments
- **Multiple output formats** - Markdown reports with Mermaid diagrams + JSON export

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
        uses: your-org/threat-model-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          frameworks: 'SOC2'
          output-formats: 'markdown,json'

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: threat-model
          path: threat-model/
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `anthropic-api-key` | Yes | - | Anthropic API key for Claude-powered analysis |
| `frameworks` | No | `SOC2` | Compliance frameworks to assess (SOC2,PCI-DSS,HIPAA) |
| `output-formats` | No | `markdown,json` | Output formats to generate |
| `fail-on-high-risk` | No | `false` | Fail the build if unmitigated high-risk threats are found |
| `config-path` | No | `.threat-model.yml` | Path to optional configuration file |

## Outputs

| Output | Description |
|--------|-------------|
| `threats-found` | Total number of threats identified |
| `high-risk-count` | Number of unmitigated high-risk threats |
| `compliance-score` | Compliance percentage (0-100) |
| `report-path` | Path to the generated report directory |

## How It Works

The action runs a 7-stage pipeline:

1. **Tech Stack Analysis** (static) - Scans dependency manifests to detect languages, frameworks, databases, auth systems, and security libraries
2. **Infrastructure Parsing** (static) - Parses Terraform, Docker Compose, and Kubernetes files to map cloud resources, networking, and security controls
3. **API Surface Mapping** (static) - Discovers all endpoints, authentication requirements, and middleware chains
4. **Data Flow Analysis** (Claude AI) - Maps how data moves through the system across trust boundaries
5. **STRIDE Threat Generation** (Claude AI) - Applies the STRIDE framework to identify threats, detect existing mitigations, and calculate risk scores
6. **Compliance Mapping** (Claude AI) - Maps detected controls to regulatory requirements and identifies gaps
7. **Report Generation** - Produces Markdown and JSON reports from templates

### Architecture

```
Discovery (Static, Parallel)     Reasoning (Claude AI)           Output
┌──────────────────────┐        ┌─────────────────────┐        ┌──────────┐
│ Tech Stack Parser    │───┐    │ Data Flow Analysis  │───┐    │ Markdown │
│ Infrastructure Parser│───┤───>│ STRIDE Threats      │───┤───>│ JSON     │
│ API Surface Parser   │───┘    │ Compliance Mapping  │───┘    │ Summary  │
└──────────────────────┘        └─────────────────────┘        └──────────┘
```

## Compliance Frameworks

### SOC2 (Trust Service Criteria 2017)
Covers CC6 (Access Controls), CC7 (Operations), CC8 (Change Management), CC9 (Risk Mitigation)

### PCI-DSS v4.0
Covers Requirements 1-12 including encryption, secure development, authentication, and logging

### HIPAA Security Rule
Covers Administrative (§164.308), Physical (§164.310), and Technical (§164.312) safeguards

## Output Example

The action generates a `threat-model/` directory containing:

- `THREAT_MODEL.md` - Full report with executive summary, data flow diagrams, threat analysis, and compliance assessment
- `threat-model.json` - Machine-readable complete output for CI/CD integration

## Cost Estimate

The action makes 3 Claude API calls per run using claude-sonnet-4-6:
- Typical input: ~2-5K tokens per call
- Typical output: ~3-8K tokens per call
- **Estimated cost: $0.05-0.15 per run**

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build for distribution
npm run build
```

## License

MIT
