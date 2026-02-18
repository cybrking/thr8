# Threat Model Generator Action - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub Action that generates compliance-ready STRIDE threat models using static parsers + Claude API reasoning.

**Architecture:** Static parsers extract tech stack, infrastructure, and API surface data in parallel. Three sequential Claude API calls reason over that data to produce data flows, STRIDE threats, and compliance mappings. Handlebars templates render Markdown + JSON output.

**Tech Stack:** Node.js 20, @actions/core, @actions/github, @anthropic-ai/sdk, Handlebars, Jest

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `action.yml`
- Create: `src/index.js` (stub)
- Create: `.gitignore`

**Step 1: Create package.json with dependencies**

Core deps: @actions/core, @actions/github, @anthropic-ai/sdk, handlebars, js-yaml
Dev deps: @vercel/ncc, jest, eslint
Scripts: test (jest --coverage), build (ncc build src/index.js -o dist)

**Step 2: Create action.yml**

Inputs: anthropic-api-key (required), config-path, frameworks, output-formats, fail-on-high-risk
Outputs: threats-found, high-risk-count, compliance-score, report-path
Runs: node20, main: dist/index.js

**Step 3: Create stub src/index.js and .gitignore**

**Step 4: Install dependencies**

Run: `npm install`

**Step 5: Commit**

```bash
git add package.json package-lock.json action.yml src/index.js .gitignore
git commit -m "feat: scaffold project with package.json and action.yml"
```

---

### Task 2: Tech Stack Parser - Tests

**Files:**
- Create: `tests/fixtures/express-postgres/package.json`
- Create: `tests/agents/tech-stack.test.js`

**Step 1: Create fixture package.json**

Include deps: express, pg, jsonwebtoken, passport, passport-google-oauth20, stripe, @aws-sdk/client-s3, helmet, bcrypt, express-rate-limit, winston, cors, express-validator, ioredis

**Step 2: Write 11 test cases**

- Detects Node.js runtime
- Detects Express framework with version
- Detects PostgreSQL via pg client
- Detects Redis via ioredis
- Detects JWT auth
- Detects OAuth2 via passport
- Detects Stripe external service
- Detects AWS S3 external service
- Detects helmet security library
- Detects bcrypt security library
- Returns empty arrays for nonexistent path

**Step 3: Run tests to verify failure**

Run: `npx jest tests/agents/tech-stack.test.js --no-coverage`
Expected: FAIL - Cannot find module

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: add tech stack parser tests and fixture"
```

---

### Task 3: Tech Stack Parser - Implementation

**Files:**
- Create: `src/parsers/package-json.js`
- Create: `src/parsers/requirements-txt.js`
- Create: `src/agents/tech-stack.js`

**Step 1: Create package-json parser**

Keyword dictionaries mapping npm package names to categories:
- FRAMEWORK_MAP: express, koa, fastify, hapi, next, nuxt
- DATABASE_MAP: pg, mysql2, mongoose, mongodb, ioredis, redis, sequelize, typeorm, prisma, knex
- AUTH_MAP: jsonwebtoken, passport, passport-google-oauth20, passport-github2, express-session
- EXTERNAL_SERVICE_MAP: stripe, @sendgrid/mail, twilio, @aws-sdk/client-s3, @aws-sdk/client-ses, etc.
- SECURITY_MAP: helmet, bcrypt, express-rate-limit, cors, csurf, express-validator, joi, zod

Reads package.json, merges dependencies + devDependencies, classifies each dep.

**Step 2: Create requirements-txt parser**

Same pattern for Python: django/flask/fastapi, psycopg2/mysqlclient/pymongo, pyjwt, boto3, etc.

**Step 3: Create tech-stack agent**

Runs both parsers, merges results (primary runtime = first detected).

**Step 4: Run tests**

Run: `npx jest tests/agents/tech-stack.test.js --no-coverage`
Expected: All 11 PASS

**Step 5: Commit**

```bash
git add src/agents/tech-stack.js src/parsers/package-json.js src/parsers/requirements-txt.js
git commit -m "feat: implement tech stack parser with Node.js and Python support"
```

---

### Task 4: Infrastructure Parser - Tests

**Files:**
- Create: `tests/fixtures/express-postgres/terraform/main.tf`
- Create: `tests/fixtures/express-postgres/docker-compose.yml`
- Create: `tests/agents/infrastructure.test.js`

**Step 1: Create Terraform fixture**

AWS provider with: VPC (10.0.0.0/16), 2 subnets (public + private), security group (web-sg with 443 ingress), ECS Fargate service (3 containers), RDS PostgreSQL (encrypted, multi-AZ, not public), S3 bucket with KMS encryption, Secrets Manager secret, CloudWatch log group.

**Step 2: Create docker-compose fixture**

Services: api (build, port 3000), db (postgres:15, port 5432), redis (redis:7-alpine, port 6379)

**Step 3: Write 10 test cases**

- Detects AWS provider
- Detects ECS Fargate compute
- Detects VPC CIDR
- Detects security groups with name
- Detects RDS with encryption, multi-AZ, not public
- Detects S3 bucket
- Detects Secrets Manager
- Detects CloudWatch Logs monitoring
- Detects Docker Compose services
- Returns empty structure for nonexistent path

**Step 4: Run to verify failure, commit**

```bash
git add tests/
git commit -m "test: add infrastructure parser tests and IaC fixtures"
```

---

### Task 5: Infrastructure Parser - Implementation

**Files:**
- Create: `src/parsers/terraform.js`
- Create: `src/parsers/dockerfile.js`
- Create: `src/agents/infrastructure.js`

**Step 1: Create Terraform parser**

- Walk repo for .tf files
- Regex-extract resource blocks (type, name, body)
- detectProvider: check for aws/google/azurerm provider or resource prefixes
- extractCompute: aws_ecs_service (launch_type, desired_count), aws_instance, aws_lambda_function
- extractNetworking: aws_vpc (cidr), aws_subnet (cidr, AZ, name tag), aws_security_group (name)
- extractDataStores: aws_db_instance (engine, version, encrypted, multi_az, public), aws_s3_bucket, aws_dynamodb_table
- extractSecrets: aws_secretsmanager_secret, aws_ssm_parameter
- extractMonitoring: aws_cloudwatch_log_group, aws_cloudwatch_metric_alarm

**Step 2: Create Docker Compose parser**

YAML parse docker-compose.yml, extract service names, images, ports, depends_on.

**Step 3: Create infrastructure agent**

Runs Terraform + Docker parsers in parallel, merges results.

**Step 4: Run tests**

Run: `npx jest tests/agents/infrastructure.test.js --no-coverage`
Expected: All 10 PASS

**Step 5: Commit**

```bash
git add src/agents/infrastructure.js src/parsers/terraform.js src/parsers/dockerfile.js
git commit -m "feat: implement infrastructure parser for Terraform and Docker Compose"
```

---

### Task 6: API Surface Parser - Tests & Implementation

**Files:**
- Create: `tests/fixtures/express-postgres/routes/users.js`
- Create: `tests/fixtures/express-postgres/routes/payments.js`
- Create: `tests/fixtures/express-postgres/app.js`
- Create: `tests/agents/api-surface.test.js`
- Create: `src/parsers/express-routes.js`
- Create: `src/agents/api-surface.js`

**Step 1: Create Express route fixtures**

app.js: helmet, cors, json middleware. Mounts /api/users and /api/payments routers.
routes/users.js: POST / (with express-validator), GET /:id (with auth), PUT /:id (with auth), DELETE /:id (with auth)
routes/payments.js: POST / (with auth + rateLimit), GET /:id (with auth)

**Step 2: Write 5 test cases**

- Discovers Express routes (count > 0)
- Detects POST routes
- Detects GET routes
- Detects auth middleware in route chain
- Returns empty for unknown framework

**Step 3: Run to verify failure**

**Step 4: Create Express routes parser**

Walk repo for .js/.ts files. Regex match `router.method('path', ...)` and `app.method('path', ...)`. Extract method, path, file, middleware names from argument chain.

**Step 5: Create API surface agent**

Dispatches to Express parser based on framework name. Maps middleware names to authentication flags.

**Step 6: Run tests**

Run: `npx jest tests/agents/api-surface.test.js --no-coverage`
Expected: All 5 PASS

**Step 7: Commit**

```bash
git add src/agents/api-surface.js src/parsers/express-routes.js tests/
git commit -m "feat: implement API surface parser with Express route detection"
```

---

### Task 7: STRIDE Pattern Database

**Files:**
- Create: `src/patterns/stride-database.json`
- Create: `src/patterns/stride-api.json`
- Create: `src/patterns/stride-auth.json`
- Create: `src/patterns/stride-storage.json`

**Step 1: Create pattern files (8-12 patterns each)**

Each pattern: id, category (Spoofing/Tampering/Repudiation/Information Disclosure/Denial of Service/Elevation of Privilege), title, description, default_likelihood, default_impact, common_mitigations array, cvss_vector_template.

- stride-database.json: SQL injection, unencrypted data at rest, missing audit logs, privilege escalation, backup exposure, connection pool exhaustion, data exfiltration, schema tampering
- stride-api.json: Injection attacks, CSRF, missing rate limiting, verbose errors, broken access control, missing input validation, CORS misconfiguration, HTTP method tampering
- stride-auth.json: Credential stuffing, session hijacking, JWT forgery, weak passwords, missing MFA, token replay, account enumeration, privilege escalation
- stride-storage.json: Unauthorized access, missing encryption, pre-signed URL abuse, missing access logging, versioning disabled, cross-account access, data residency violations

**Step 2: Commit**

```bash
git add src/patterns/
git commit -m "feat: add STRIDE threat pattern databases"
```

---

### Task 8: Compliance Framework Definitions

**Files:**
- Create: `src/frameworks/soc2.json`
- Create: `src/frameworks/pci-dss.json`
- Create: `src/frameworks/hipaa.json`

**Step 1: Create framework files**

Each control: id, description, evidence_types (what satisfies it), category.

- soc2.json: ~20 controls across CC6-CC9 (access controls, system operations, change management, risk mitigation)
- pci-dss.json: ~25 controls focused on Req 1 (firewalls), 4 (encryption), 6 (secure dev), 8 (auth), 10 (logging), 12 (policies)
- hipaa.json: ~20 controls across Administrative (164.308), Physical (164.310), Technical (164.312) safeguards

**Step 2: Commit**

```bash
git add src/frameworks/
git commit -m "feat: add SOC2, PCI-DSS, and HIPAA compliance framework definitions"
```

---

### Task 9: Data Flow Agent (Claude-powered)

**Files:**
- Create: `tests/agents/data-flow.test.js`
- Create: `src/agents/data-flow.js`

**Step 1: Write tests with mocked Anthropic SDK**

Mock `@anthropic-ai/sdk` to return a fixed data flow JSON response. Test:
- Returns flows with steps and trust boundaries
- Falls back to empty flows on API error

**Step 2: Implement DataFlowAgent**

Constructor takes API key, creates Anthropic client. `analyze(context)` method:
- System prompt instructs Claude to output JSON with flows, steps, trust boundaries, data classifications
- User message contains stringified context (tech stack + infra + API surface)
- Parse response, extract JSON (handle markdown code blocks)
- Catch errors, return `{ flows: [] }` as fallback

**Step 3: Run tests, commit**

```bash
git add src/agents/data-flow.js tests/agents/data-flow.test.js
git commit -m "feat: implement data flow agent with Claude API integration"
```

---

### Task 10: Threat Generator Agent (Claude-powered)

**Files:**
- Create: `tests/agents/threat-generator.test.js`
- Create: `src/agents/threat-generator.js`

**Step 1: Write tests with mocked Claude**

Test:
- Returns components with STRIDE threats
- Includes summary with category and risk counts
- Loads and sends pattern files in prompt
- Falls back on API error

**Step 2: Implement ThreatGeneratorAgent**

Constructor takes API key. `generate(context)` method:
- Loads all pattern JSON files from src/patterns/
- System prompt instructs Claude to apply STRIDE, check mitigations, calculate risk scores, generate CVSS vectors
- User message: all agent outputs + pattern database
- Parse structured response
- Fallback: use patterns alone for basic threat generation

**Step 3: Run tests, commit**

```bash
git add src/agents/threat-generator.js tests/agents/threat-generator.test.js
git commit -m "feat: implement STRIDE threat generator with Claude reasoning"
```

---

### Task 11: Compliance Agent (Claude-powered)

**Files:**
- Create: `tests/agents/compliance.test.js`
- Create: `src/agents/compliance.js`

**Step 1: Write tests with mocked Claude**

Test:
- Maps threats to framework controls
- Returns compliance score
- Identifies gaps with recommendations
- Handles SOC2 framework
- Falls back on error

**Step 2: Implement ComplianceAgent**

Constructor takes API key and framework name. `assess(threatModel)` method:
- Load framework JSON from src/frameworks/
- System prompt instructs Claude to assess each control against detected mitigations
- Parse structured response with control statuses, evidence, gaps, recommendations
- Calculate summary: total controls, compliant, partial, non-compliant, overall score

**Step 3: Run tests, commit**

```bash
git add src/agents/compliance.js tests/agents/compliance.test.js
git commit -m "feat: implement compliance mapping agent for SOC2/PCI-DSS/HIPAA"
```

---

### Task 12: Handlebars Report Templates

**Files:**
- Create: `src/templates/threat-model.md.hbs`
- Create: `src/templates/dfd.mmd.hbs`
- Create: `src/templates/compliance.md.hbs`

**Step 1: Create main threat model template**

Sections: title, executive summary, system architecture (embedded Mermaid DFD partial), component inventory table, trust boundaries, threat analysis (grouped by component, then STRIDE category), recommendations (prioritized), appendices.

Handlebars helpers: riskBadge (Critical/High/Medium/Low), statusIcon (implemented=check, missing=X, partial=warning), date formatting.

**Step 2: Create DFD Mermaid template**

Iterates flows, generates `graph LR` with nodes for each step, subgraphs for trust boundaries.

**Step 3: Create compliance matrix template**

Table per framework with: Control ID, Description, Status (icon), Coverage %, Evidence, Gaps.

**Step 4: Commit**

```bash
git add src/templates/
git commit -m "feat: add Handlebars report templates"
```

---

### Task 13: Reporter Agent

**Files:**
- Create: `tests/agents/reporter.test.js`
- Create: `src/agents/reporter.js`

**Step 1: Write tests**

Test:
- Generates THREAT_MODEL.md from threat model data
- Generates threat-model.json export
- Creates output directory if it doesn't exist
- Embeds Mermaid DFD in markdown
- Includes compliance section when results provided

**Step 2: Implement ReporterAgent**

`generate({ threatModel, dataFlows, complianceResults, formats, outputDir })`:
- Register Handlebars helpers and partials
- Compile templates
- If markdown: render threat-model.md.hbs, write THREAT_MODEL.md
- If json: write threat-model.json with all data
- Return paths to generated files

**Step 3: Run tests, commit**

```bash
git add src/agents/reporter.js tests/agents/reporter.test.js
git commit -m "feat: implement reporter agent with markdown and JSON output"
```

---

### Task 14: Main Orchestrator

**Files:**
- Modify: `src/index.js`
- Create: `tests/index.test.js`

**Step 1: Write integration test**

Mock @actions/core (getInput, setOutput, setFailed, startGroup, endGroup, summary).
Mock @anthropic-ai/sdk.
Test:
- Reads all inputs correctly
- Runs TechStack + Infrastructure in parallel
- Runs APISurface after tech stack
- Chains DataFlow -> ThreatGenerator -> Compliance sequentially
- Calls Reporter with all outputs
- Sets action outputs (threats-found, high-risk-count, compliance-score, report-path)
- Creates job summary table
- Fails build when fail-on-high-risk=true and high-risk threats exist

**Step 2: Implement orchestrator**

Replace stub with full pipeline:
1. Read inputs via core.getInput
2. Initialize Anthropic client with API key
3. core.startGroup('Analyzing repository...')
4. Parallel: TechStackAgent.analyze(repoPath), InfrastructureAgent.analyze(repoPath)
5. APISurfaceAgent.analyze(repoPath, techStack)
6. core.startGroup('Mapping data flows...')
7. DataFlowAgent.analyze({ techStack, infrastructure, apiSurface })
8. core.startGroup('Generating threat model...')
9. ThreatGeneratorAgent.generate({ techStack, infrastructure, apiSurface, dataFlows })
10. core.startGroup('Assessing compliance...')
11. ComplianceAgent.assess(threatModel) for each framework
12. core.startGroup('Generating reports...')
13. ReporterAgent.generate(...)
14. Set outputs, write summary, check fail-on-high-risk

**Step 3: Run full test suite**

Run: `npx jest --coverage`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/index.js tests/index.test.js
git commit -m "feat: implement main orchestrator with full agent pipeline"
```

---

### Task 15: Build & Package

**Step 1: Build with ncc**

Run: `npm run build`
Expected: dist/index.js created

**Step 2: Smoke test**

Run: `node dist/index.js` (will fail gracefully on missing GITHUB_WORKSPACE but validates packaging)

**Step 3: Commit dist**

```bash
git add dist/
git commit -m "build: compile action with ncc for distribution"
```

---

### Task 16: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Sections: badges, description, quick start (workflow YAML example), inputs table, outputs table, example output preview, supported frameworks, architecture overview, contributing.

**Step 2: Run full test suite final time**

Run: `npm test`
Expected: All PASS, >80% coverage

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage examples"
```
