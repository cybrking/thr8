const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const ReporterAgent = require('../../src/agents/reporter');

describe('ReporterAgent', () => {
  let outputDir;
  let agent;

  const sampleData = {
    threatModel: {
      business_objectives: [{
        objective: 'Data Integrity',
        impact_of_breach: 'High',
        description: 'No persistence layer',
        tech_context: 'Node.js, Express'
      }],
      overall_risk_status: 'HIGH',
      attack_surfaces: [{
        name: 'Public API',
        vector: 'HTTP Endpoint',
        weakness: 'No authentication',
        vulnerabilities: [{
          id: 'API-001',
          title: 'Unrestricted access',
          description: 'No auth on endpoints',
          severity: 'Critical'
        }]
      }],
      attack_scenarios: [{
        name: 'Data Exfiltration',
        objective: 'Extract user data',
        steps: [
          { phase: 'Reconnaissance', action: 'Probe API', exploits: [] },
          { phase: 'Exploitation', action: 'Access endpoints', exploits: ['API-001'] }
        ]
      }],
      risk_analysis: [{
        risk_id: 'AUTH-001',
        title: 'Auth Bypass',
        pasta_level: 'Critical',
        business_impact: 'Full breach',
        mitigation_complexity: 'Medium',
        linked_vulnerabilities: ['API-001']
      }],
      tactical_recommendations: [
        { priority: 'Immediate', action: 'Add authentication', addresses: ['AUTH-001'] }
      ],
      summary: {
        total_vulnerabilities: 1,
        critical: 1, high: 0, medium: 0, low: 0,
        attack_scenarios: 1, attack_surfaces: 1
      }
    },
    dataFlows: {
      flows: [{
        id: 'user_reg',
        name: 'User Registration',
        data_classification: 'PII',
        steps: [
          { component: 'Browser', type: 'external_user', data: ['email'] },
          { component: 'API', type: 'application', process: 'Validate' }
        ],
        trust_boundaries: [{ from: 'Internet', to: 'App', control: 'TLS', authentication: 'None' }]
      }]
    },
    projectName: 'test-project'
  };

  beforeEach(async () => {
    outputDir = path.join(os.tmpdir(), `threat-model-test-${Date.now()}`);
    agent = new ReporterAgent();
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  test('generates PASTA THREAT_MODEL.md', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    expect(result.markdown).toBeDefined();
    const content = await fs.readFile(result.markdown, 'utf-8');
    expect(content).toContain('PASTA Threat Model Report');
    expect(content).toContain('Business Objectives');
  });

  test('generates threat-model.json', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['json'],
      outputDir,
    });
    expect(result.json).toBeDefined();
    const content = JSON.parse(await fs.readFile(result.json, 'utf-8'));
    expect(content.threatModel).toBeDefined();
    expect(content.projectName).toBe('test-project');
  });

  test('creates output directory if missing', async () => {
    const deepDir = path.join(outputDir, 'nested', 'deep');
    await agent.generate({
      ...sampleData,
      formats: ['json'],
      outputDir: deepDir,
    });
    const exists = await fs.access(deepDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test('markdown contains attack surfaces, scenarios, and risk analysis', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    const content = await fs.readFile(result.markdown, 'utf-8');
    expect(content).toContain('Threat & Vulnerability Analysis');
    expect(content).toContain('API-001');
    expect(content).toContain('Attack Modeling');
    expect(content).toContain('Risk & Impact Analysis');
    expect(content).toContain('AUTH-001');
    expect(content).toContain('Tactical Recommendations');
  });
});
