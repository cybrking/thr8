const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const ReporterAgent = require('../../src/agents/reporter');

describe('ReporterAgent', () => {
  let outputDir;
  let agent;

  const sampleData = {
    threatModel: {
      components: [{
        name: 'Express API',
        type: 'process',
        threats: [{
          id: 'API-001',
          category: 'Spoofing',
          title: 'JWT forgery',
          description: 'Attacker forges JWT',
          likelihood: 'Medium',
          impact: 'High',
          risk_score: 7.5,
          residual_risk: 'Low',
          mitigations: [{ control: 'RS256', status: 'implemented', evidence: 'Found in auth.js' }]
        }]
      }],
      summary: {
        total_threats: 1,
        by_category: { Spoofing: 1, Tampering: 0, Repudiation: 0, 'Information Disclosure': 0, 'Denial of Service': 0, 'Elevation of Privilege': 0 },
        by_risk: { critical: 0, high: 0, medium: 1, low: 0 },
        unmitigated_high_risk: 0
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
    complianceResults: [{
      framework: 'SOC2',
      version: '2017',
      assessment_date: '2026-02-17',
      controls: [{
        control_id: 'CC6.1',
        description: 'Access controls',
        status: 'compliant',
        coverage: 100,
        evidence: ['JWT auth'],
        gaps: [],
        recommendations: []
      }],
      summary: { total_controls: 1, compliant: 1, partial: 0, non_compliant: 0, overall_score: 100 }
    }]
  };

  beforeEach(async () => {
    outputDir = path.join(os.tmpdir(), `threat-model-test-${Date.now()}`);
    agent = new ReporterAgent();
  });

  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  test('generates THREAT_MODEL.md from template', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    expect(result.markdown).toBeDefined();
    const content = await fs.readFile(result.markdown, 'utf-8');
    expect(content).toContain('Threat Model Report');
    expect(content).toContain('Executive Summary');
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
    expect(content.generated).toBeDefined();
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

  test('markdown contains threat analysis section', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    const content = await fs.readFile(result.markdown, 'utf-8');
    expect(content).toContain('Threat Analysis');
    expect(content).toContain('JWT forgery');
    expect(content).toContain('API-001');
  });

  test('markdown contains compliance section', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    const content = await fs.readFile(result.markdown, 'utf-8');
    expect(content).toContain('Compliance Assessment');
    expect(content).toContain('SOC2');
    expect(content).toContain('CC6.1');
  });
});
