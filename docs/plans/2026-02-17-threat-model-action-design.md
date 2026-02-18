# Threat Model Generator GitHub Action - Design Document

**Date**: 2026-02-17
**Status**: Approved

## Overview

GitHub Action that auto-generates compliance-ready threat models by analyzing repository code, infrastructure, and dependencies. Uses deterministic parsers for discovery and Claude API for threat reasoning.

## Key Decisions

- **Analysis mode**: LLM-enhanced via Claude API (required)
- **LLM provider**: Anthropic Claude (claude-sonnet-4-6)
- **Output formats**: Markdown + JSON (v1), PDF/Excel deferred
- **API key**: Required input (`anthropic-api-key`)
- **Architecture**: Static parsers for discovery, Claude for reasoning (Approach A)

## Architecture

```
DISCOVERY (Static, Parallel)     REASONING (Claude API, Sequential)     OUTPUT
┌──────────────┐                ┌──────────────────────┐              ┌──────────┐
│ Tech Stack   │──┐             │ Data Flow Analysis   │──┐           │ Markdown │
│ Parser       │  │             │ (Claude call #1)     │  │           │ Report   │
├──────────────┤  ├──────────►  ├──────────────────────┤  ├────────►  ├──────────┤
│Infrastructure│  │             │ STRIDE Threats       │  │           │ JSON     │
│ Parser       │  │             │ (Claude call #2)     │  │           │ Export   │
├──────────────┤  │             ├──────────────────────┤  │           ├──────────┤
│ API Surface  │──┘             │ Compliance Mapping   │──┘           │ GH       │
│ Parser       │                │ (Claude call #3)     │              │ Summary  │
└──────────────┘                └──────────────────────┘              └──────────┘
```

## Discovery Parsers (Static)

### Tech Stack Parser
- Scans: package.json, requirements.txt, Pipfile, Gemfile, go.mod, pom.xml, build.gradle
- Classifies deps into: runtime, framework, databases, auth, external services, security libs
- Uses keyword dictionaries for classification

### Infrastructure Parser
- Scans: .tf files, docker-compose.yml, K8s manifests, CloudFormation templates
- Extracts: compute, networking (VPCs, SGs), data stores, encryption, IAM, secrets mgmt
- HCL regex parsing for Terraform, YAML parsing for others

### API Surface Parser
- Express: app.get/post/put/delete/patch route patterns
- Django: urlpatterns in urls.py
- Rails: routes.rb DSL
- FastAPI: @app decorators
- Extracts: method, path, middleware (auth/rate-limit), handler location, validation

## Claude Reasoning Layer

Three focused API calls with structured JSON I/O:

1. **Data Flow Analysis** - Maps data movement across trust boundaries from discovery outputs
2. **STRIDE Threat Generation** - Applies STRIDE framework, checks mitigations, calculates risk scores
3. **Compliance Mapping** - Maps controls to SOC2/PCI-DSS/HIPAA requirements

Token budget: ~2-5K input, ~3-8K output per call. Cost: ~$0.05-0.15/run.
Fallback: Pattern-database-only analysis if Claude calls fail after retry.

## Output

- **THREAT_MODEL.md**: Full report via Handlebars templates with embedded Mermaid DFDs
- **threat-model.json**: Machine-readable complete output
- **GitHub Summary**: Key metrics table in job summary
- **Action outputs**: threats-found, high-risk-count, compliance-score, report-path

## Technology Stack

- JavaScript (Node.js 20)
- @actions/core, @actions/github
- @anthropic-ai/sdk
- Handlebars for templates
- Jest for testing

## Testing Strategy

- Unit tests per parser with fixture files
- Mocked Claude responses for reasoning tests
- Integration test with express-postgres fixture
- Cross-language fixtures: django-mysql, rails-api
