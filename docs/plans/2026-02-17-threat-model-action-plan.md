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

name: threat-model-action, main: src/index.js
Dependencies: @actions/core@^1.10.1, @actions/github@^6.0.0, @anthropic-ai/sdk@^0.39.0, handlebars@^4.7.8, js-yaml@^4.1.0
DevDeps: @vercel/ncc@^0.38.1, jest@^29.7.0
Scripts: test (jest --coverage), build (ncc build src/index.js -o dist)

**Step 2: Create action.yml**

Inputs: anthropic-api-key (required), config-path (default .threat-model.yml), frameworks (default SOC2), output-formats (default markdown,json), fail-on-high-risk (default false)
Outputs: threats-found, high-risk-count, compliance-score, report-path
Runs: using node20, main dist/index.js

**Step 3: Create stub src/index.js**

Just a console.log placeholder.

**Step 4: Create .gitignore**

node_modules/, dist/, coverage/, *.log

**Step 5: Install dependencies**

Run: `npm install`

**Step 6: Commit**

```
git add package.json package-lock.json action.yml src/index.js .gitignore
git commit -m "feat: scaffold project with package.json and action.yml"
```

---

### Task 2: Tech Stack Parser - Tests

**Files:**
- Create: `tests/fixtures/express-postgres/package.json`
- Create: `tests/agents/tech-stack.test.js`

**Step 1: Create test fixture package.json**

A realistic Express app with: express@^4.18.2, pg@^8.11.0, jsonwebtoken@^9.0.0, passport@^0.7.0, passport-google-oauth20@^2.0.0, stripe@^12.0.0, @aws-sdk/client-s3@^3.0.0, helmet@^7.0.0, bcrypt@^5.1.0, express-rate-limit@^7.1.0, winston@^3.11.0, cors@^2.8.5, express-validator@^7.0.1, ioredis@^5.3.0

**Step 2: Write failing tests (11 tests)**

- detects Node.js runtime from package.json
- detects Express framework
- detects PostgreSQL database via pg client
- detects Redis database via ioredis
- detects JWT authentication
- detects OAuth2 via passport
- detects Stripe external service
- detects AWS S3 external service
- detects helmet security library
- detects bcrypt security library
- returns empty arrays when no package.json found

**Step 3: Run tests to verify they fail**

Run: `npx jest tests/agents/tech-stack.test.js --no-coverage`
Expected: FAIL - Cannot find module

**Step 4: Commit test files**

---

### Task 3: Tech Stack Parser - Implementation

**Files:**
- Create: `src/parsers/package-json.js`
- Create: `src/parsers/requirements-txt.js`
- Create: `src/agents/tech-stack.js`

**Step 1: Create package-json parser**

Keyword dictionaries mapping package names to categories:
- FRAMEWORK_MAP: express->Express, koa->Koa, fastify->Fastify, next->Next.js
- DATABASE_MAP: pg->PostgreSQL, mysql2->MySQL, mongoose->MongoDB, ioredis->Redis, sequelize/typeorm/prisma->ORM
- AUTH_MAP: jsonwebtoken->JWT, passport-google-oauth20->OAuth2, express-session->Session
- EXTERNAL_SERVICE_MAP: stripe->Stripe, @aws-sdk/client-s3->AWS S3, @sendgrid/mail->SendGrid
- SECURITY_MAP: helmet->HTTP headers, bcrypt->Password hashing, express-rate-limit->Rate limiting, cors->CORS, express-validator->Input validation

Reads package.json, merges dependencies+devDependencies, matches against dictionaries.

**Step 2: Create requirements-txt parser**

Same pattern for Python: django/flask/fastapi, psycopg2/pymongo, pyjwt/authlib, stripe/boto3

**Step 3: Create tech-stack agent**

Class that runs both parsers, merges results (primary runtime = first detected).

**Step 4: Run tests**

Run: `npx jest tests/agents/tech-stack.test.js --no-coverage`
Expected: All 11 tests PASS

**Step 5: Commit**

---

### Task 4: Infrastructure Parser - Tests

**Files:**
- Create: `tests/fixtures/express-postgres/terraform/main.tf`
- Create: `tests/fixtures/express-postgres/docker-compose.yml`
- Create: `tests/agents/infrastructure.test.js`

**Step 1: Create Terraform fixture**

AWS provider with: VPC (10.0.0.0/16), public+private subnets, security groups (web-sg with 443 ingress, db-sg), ECS Fargate service (3 containers), RDS PostgreSQL 15.2 (encrypted, multi-az, not public), KMS key, S3 bucket with SSE, Secrets Manager secret, CloudWatch log group.

**Step 2: Create docker-compose fixture**

Services: api (build, port 3000), db (postgres:15, port 5432), redis (redis:7-alpine, port 6379)

**Step 3: Write failing tests (10 tests)**

- detects AWS provider
- detects ECS Fargate compute
- detects VPC networking
- detects security groups
- detects RDS with encryption/multi-az/not-public
- detects S3 bucket
- detects Secrets Manager
- detects CloudWatch monitoring
- detects Docker Compose services
- returns empty for no IaC path

**Step 4: Run tests, verify failure, commit**

---

### Task 5: Infrastructure Parser - Implementation

**Files:**
- Create: `src/parsers/terraform.js`
- Create: `src/parsers/dockerfile.js`
- Create: `src/agents/infrastructure.js`

**Step 1: Create Terraform parser**

- findTfFiles: recursive walk for .tf files (skip node_modules, dot dirs)
- extractResources: regex for `resource "type" "name" { body }`
- detectProvider: check for aws_/google_/azurerm_ prefixes
- extractCompute: ECS services, EC2 instances, Lambda functions
- extractNetworking: VPCs (cidr), subnets (cidr, az, name tag), security groups (name)
- extractDataStores: RDS (engine, version, encryption, multi-az, public), S3, DynamoDB
- extractSecrets: Secrets Manager, SSM Parameter Store
- extractMonitoring: CloudWatch log groups, metric alarms

**Step 2: Create Docker Compose parser**

Parse YAML with js-yaml, extract service name, image, build flag, ports, depends_on.

**Step 3: Create infrastructure agent**

Class that runs terraform + docker parsers in parallel, merges results.

**Step 4: Run tests**

Expected: All 10 tests PASS

**Step 5: Commit**

---

### Task 6: API Surface Parser - Tests and Implementation

**Files:**
- Create: `tests/fixtures/express-postgres/app.js`
- Create: `tests/fixtures/express-postgres/routes/users.js`
- Create: `tests/fixtures/express-postgres/routes/payments.js`
- Create: `tests/agents/api-surface.test.js`
- Create: `src/parsers/express-routes.js`
- Create: `src/agents/api-surface.js`

**Step 1: Create Express fixture files**

app.js: helmet, cors, express.json, routes mounted at /api/users and /api/payments, health endpoint
routes/users.js: POST / (with express-validator), GET /:id (auth), PUT /:id (auth), DELETE /:id (auth)
routes/payments.js: POST / (auth + rateLimit), GET /:id (auth)

**Step 2: Write tests (5 tests)**

- discovers Express route files
- detects POST routes
- detects GET routes
- detects middleware (auth) in route chain
- returns empty for unknown framework

**Step 3: Create express-routes parser**

- findJsFiles: recursive walk for .js/.ts files
- extractRoutes: regex for `(router|app).(get|post|put|patch|delete)('path', ...args)`
- Parse middleware from argument chain (all args except last = middleware)

**Step 4: Create API surface agent**

Class that dispatches to framework-specific parser, enriches with auth detection.

**Step 5: Run tests, commit**

---

### Task 7: STRIDE Pattern Database

**Files:**
- Create: `src/patterns/stride-database.json`
- Create: `src/patterns/stride-api.json`
- Create: `src/patterns/stride-auth.json`
- Create: `src/patterns/stride-storage.json`

Each file: 8-12 STRIDE threat patterns per component type. Schema per pattern:
```json
{
  "id": "DB-TAMP-001",
  "category": "Tampering",
  "title": "SQL Injection",
  "description": "Attacker injects SQL via unsanitized input...",
  "default_likelihood": "High",
  "default_impact": "Critical",
  "common_mitigations": ["Parameterized queries", "ORM usage", "Input validation"],
  "cvss_vector_template": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
}
```

Key patterns per file:
- database: SQL injection, unencrypted at rest, missing audit logs, privilege escalation, backup exposure, connection exhaustion
- api: injection, CSRF, no rate limiting, verbose errors, broken access control, missing validation, CORS misconfiguration
- auth: credential stuffing, session hijacking, JWT forgery, weak passwords, missing MFA, token replay, account enumeration
- storage: unauthorized access, missing encryption, presigned URL abuse, no access logging, versioning disabled, public bucket

**Commit after creating all four files.**

---

### Task 8: Compliance Framework Definitions

**Files:**
- Create: `src/frameworks/soc2.json`
- Create: `src/frameworks/pci-dss.json`
- Create: `src/frameworks/hipaa.json`

Each file maps control IDs to descriptions and evidence types:

**soc2.json** (~20 controls): CC6.1-CC6.8 (access controls), CC7.1-CC7.5 (operations), CC8.1 (change mgmt), CC9.1-CC9.2 (risk mitigation)

**pci-dss.json** (~25 controls): Req 1 (firewalls), Req 2 (default passwords), Req 3 (stored data), Req 4 (encryption in transit), Req 6 (secure dev), Req 7 (access restriction), Req 8 (auth), Req 10 (logging), Req 11 (testing), Req 12 (policy)

**hipaa.json** (~20 controls): 164.308 (admin safeguards), 164.310 (physical), 164.312 (technical - access control, audit, integrity, transmission security)

Schema per control:
```json
{
  "id": "CC6.1",
  "category": "Logical and Physical Access Controls",
  "description": "The entity implements logical access security...",
  "evidence_types": ["authentication_mechanism", "rbac", "mfa", "iam_policies"]
}
```

**Commit after creating all three files.**

---

### Task 9: Data Flow Agent (Claude Reasoning)

**Files:**
- Create: `src/agents/data-flow.js`
- Create: `tests/agents/data-flow.test.js`

**Step 1: Write tests with mocked @anthropic-ai/sdk**

Mock the SDK constructor to return a mock messages.create that resolves with sample flow JSON.

Tests:
- calls Claude and returns parsed flows
- returns empty flows on API error

**Step 2: Implement DataFlowAgent class**

Constructor takes apiKey, creates Anthropic client.
analyze(context) method:
- System prompt: security architect role, JSON-only output, flow schema definition
- User message: JSON.stringify of tech stack + infra + API surface
- Parse response, handle markdown code blocks
- Catch errors, return { flows: [] } fallback

Model: claude-sonnet-4-6, max_tokens: 4096

**Step 3: Run tests, commit**

---

### Task 10: Threat Generator Agent (Claude Reasoning)

**Files:**
- Create: `src/agents/threat-generator.js`
- Create: `tests/agents/threat-generator.test.js`

**Step 1: Write tests with mocked SDK**

Tests:
- loads STRIDE patterns and sends to Claude
- returns structured threat model with summary
- falls back to empty on error
- summary includes counts by category and risk level

**Step 2: Implement ThreatGeneratorAgent class**

Constructor takes apiKey.
generate(context) method:
1. Load all 4 pattern files from src/patterns/
2. System prompt: threat modeling expert, STRIDE methodology, JSON output schema with threats array and summary
3. User message: all context + patterns
4. Parse response, validate summary structure
5. Fallback on error

Model: claude-sonnet-4-6, max_tokens: 8192

**Step 3: Run tests, commit**

---

### Task 11: Compliance Agent (Claude Reasoning)

**Files:**
- Create: `src/agents/compliance.js`
- Create: `tests/agents/compliance.test.js`

**Step 1: Write tests with mocked SDK**

Tests:
- loads framework definition and sends to Claude
- returns assessment with compliance score
- identifies gaps with recommendations
- falls back on error

**Step 2: Implement ComplianceAgent class**

Constructor takes apiKey and frameworkName.
assess(threatModel) method:
1. Load framework JSON from src/frameworks/
2. System prompt: compliance auditor role, framework-specific, JSON output schema
3. User message: threat model + framework definition
4. Parse response, validate summary (total, compliant, partial, non_compliant, score)
5. Fallback on error

Model: claude-sonnet-4-6, max_tokens: 4096

**Step 3: Run tests, commit**

---

### Task 12: Report Templates

**Files:**
- Create: `src/templates/threat-model.md.hbs`
- Create: `src/templates/dfd.mmd.hbs`
- Create: `src/templates/compliance.md.hbs`

**threat-model.md.hbs structure:**
- Title with app name
- Generated date, version (git sha), framework
- Executive summary (totals, high-risk count, compliance score)
- System Architecture section with embedded Mermaid DFD (use partial for dfd.mmd.hbs)
- Component Inventory table
- Trust Boundaries section
- Threat Analysis (iterate components, then threats per component grouped by STRIDE category)
- Each threat: ID, risk score, description, mitigations with status icons
- Data Flow Diagrams section (embed mermaid per flow)
- Compliance Assessment section (use partial for compliance.md.hbs)
- Recommendations (critical, high, medium priority)
- Appendix sections

**dfd.mmd.hbs:** Iterate flows, generate `graph LR` with nodes and trust boundary subgraphs

**compliance.md.hbs:** Framework header, control table (ID, status icon, evidence), gaps list, overall score

Register Handlebars helpers: statusIcon (compliant/partial/gap), riskBadge, dateFormat

**Commit after creating templates.**

---

### Task 13: Reporter Agent

**Files:**
- Create: `src/agents/reporter.js`
- Create: `tests/agents/reporter.test.js`

**Step 1: Write tests**

Tests (use tmp directories):
- generates THREAT_MODEL.md from template
- generates threat-model.json with all data
- creates output directory if missing
- markdown contains expected sections (Executive Summary, Threat Analysis, Compliance)

**Step 2: Implement ReporterAgent class**

generate({ threatModel, dataFlows, complianceResults, techStack, infrastructure, apiSurface, formats, outputDir }):
1. mkdir -p outputDir
2. Register Handlebars helpers and partials
3. If markdown: compile threat-model.md.hbs, write THREAT_MODEL.md
4. If json: write threat-model.json with all data
5. Return { markdown: path, json: path }

**Step 3: Run tests, commit**

---

### Task 14: Main Orchestrator

**Files:**
- Modify: `src/index.js`
- Create: `tests/index.test.js`

**Step 1: Write integration test**

Mock @actions/core (getInput, setOutput, summary, setFailed, startGroup, endGroup)
Mock @anthropic-ai/sdk
Test full pipeline runs without error and sets expected outputs.

**Step 2: Implement orchestrator**

```
async function run() {
  const repoPath = process.env.GITHUB_WORKSPACE;
  const apiKey = core.getInput('anthropic-api-key', { required: true });
  const frameworks = core.getInput('frameworks').split(',').map(s => s.trim());
  const outputFormats = core.getInput('output-formats').split(',').map(s => s.trim());
  const failOnHighRisk = core.getInput('fail-on-high-risk') === 'true';

  // Step 1: Parallel discovery
  const [techStack, infrastructure] = await Promise.all([
    new TechStackAgent().analyze(repoPath),
    new InfrastructureAgent().analyze(repoPath),
  ]);
  const apiSurface = await new APISurfaceAgent().analyze(repoPath, techStack);

  // Step 2: Sequential reasoning
  const dataFlows = await new DataFlowAgent(apiKey).analyze({ techStack, infrastructure, apiSurface });
  const threatModel = await new ThreatGeneratorAgent(apiKey).generate({ techStack, infrastructure, apiSurface, dataFlows });
  const complianceResults = [];
  for (const fw of frameworks) {
    complianceResults.push(await new ComplianceAgent(apiKey, fw).assess(threatModel));
  }

  // Step 3: Generate reports
  const outputDir = path.join(repoPath, 'threat-model');
  const outputs = await new ReporterAgent().generate({
    threatModel, dataFlows, complianceResults, techStack, infrastructure, apiSurface,
    formats: outputFormats, outputDir,
  });

  // Step 4: Set outputs
  core.setOutput('threats-found', threatModel.summary?.total_threats || 0);
  core.setOutput('high-risk-count', threatModel.summary?.unmitigated_high_risk || 0);
  core.setOutput('compliance-score', complianceResults[0]?.summary?.overall_score || 0);
  core.setOutput('report-path', outputDir);

  // Step 5: Job summary
  await core.summary
    .addHeading('Threat Model Generated')
    .addTable([...])
    .write();

  // Step 6: Fail if needed
  if (failOnHighRisk && (threatModel.summary?.unmitigated_high_risk || 0) > 0) {
    core.setFailed(`Found ${threatModel.summary.unmitigated_high_risk} unmitigated high-risk threats`);
  }
}
```

**Step 3: Run all tests**

Run: `npx jest --coverage`
Expected: All tests PASS

**Step 4: Commit**

---

### Task 15: Build and Package

**Step 1: Build with ncc**

Run: `npm run build`
Expected: dist/index.js created

**Step 2: Verify build**

Run: `node dist/index.js` (will fail gracefully on missing env vars - just verify it loads)

**Step 3: Commit dist**

```
git add dist/
git commit -m "build: compile action with ncc"
```

---

### Task 16: README

**Files:**
- Create: `README.md`

Write README with: project description, quick start (workflow YAML example), inputs/outputs table, compliance frameworks supported, example output structure, how it works (architecture diagram), cost estimates (Claude API usage), contributing section.

**Commit and done.**
