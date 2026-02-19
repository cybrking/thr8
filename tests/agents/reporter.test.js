const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const ReporterAgent = require('../../src/agents/reporter');

// Mock chrome-finder for controlled testing
jest.mock('../../src/utils/chrome-finder', () => ({
  findChrome: jest.fn(() => null),
  CHROME_PATHS: { linux: [], darwin: [], win32: [] },
}));

const { findChrome } = require('../../src/utils/chrome-finder');

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
          { component: 'Browser', type: 'external_user', data: ['email'], protocol: 'HTTPS' },
          { component: 'API', type: 'application', process: 'Validate', data: ['email'] }
        ],
        trust_boundaries: [{ from: 'Internet', to: 'App', control: 'TLS', authentication: 'None' }]
      }]
    },
    projectName: 'test-project'
  };

  beforeEach(async () => {
    outputDir = path.join(os.tmpdir(), `threat-model-test-${Date.now()}`);
    agent = new ReporterAgent();
    findChrome.mockReturnValue(null);
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

  // --- HTML generation tests ---

  test('generates HTML report with all PASTA sections', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['html'],
      outputDir,
    });
    expect(result.html).toBeDefined();
    const content = await fs.readFile(result.html, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('test-project');
    // All PASTA stages present
    expect(content).toContain('Business Objectives');
    expect(content).toContain('Application Decomposition');
    expect(content).toContain('Threat &amp; Vulnerability Analysis');
    expect(content).toContain('Attack Modeling');
    expect(content).toContain('Risk &amp; Impact Analysis');
    expect(content).toContain('Tactical Recommendations');
  });

  test('HTML contains Mermaid code block when Chrome unavailable', async () => {
    findChrome.mockReturnValue(null);
    const result = await agent.generate({
      ...sampleData,
      formats: ['html'],
      outputDir,
    });
    const content = await fs.readFile(result.html, 'utf-8');
    // Should have Mermaid.js CDN script for client-side rendering
    expect(content).toContain('mermaid');
    // Should contain the graph code for client-side rendering
    expect(content).toContain('graph LR');
    // Should NOT contain pre-rendered SVG
    expect(content).not.toContain('<svg');
  });

  test('HTML contains vulnerability details with severity', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['html'],
      outputDir,
    });
    const content = await fs.readFile(result.html, 'utf-8');
    expect(content).toContain('API-001');
    expect(content).toContain('Unrestricted access');
    expect(content).toContain('critical');
  });

  test('HTML contains executive summary with stats', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['html'],
      outputDir,
    });
    const content = await fs.readFile(result.html, 'utf-8');
    expect(content).toContain('risk-badge');
    expect(content).toContain('stat-card');
    expect(content).toContain('HIGH');
  });

  test('HTML always generated even when only markdown requested', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown'],
      outputDir,
    });
    expect(result.html).toBeDefined();
    const exists = await fs.access(result.html).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test('PDF generation skipped gracefully when Chrome unavailable', async () => {
    findChrome.mockReturnValue(null);
    const result = await agent.generate({
      ...sampleData,
      formats: ['pdf'],
      outputDir,
    });
    // HTML should still be generated
    expect(result.html).toBeDefined();
    // PDF should not be generated
    expect(result.pdf).toBeUndefined();
  });

  test('HTML always generated even when only json requested', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['json'],
      outputDir,
    });
    expect(result.html).toBeDefined();
    expect(result.json).toBeDefined();
    const content = await fs.readFile(result.html, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
  });

  test('_buildMermaidGraphCode produces valid graph syntax', () => {
    const code = agent._buildMermaidGraphCode(sampleData.dataFlows);
    expect(code).toContain('graph LR');
    expect(code).toContain('user_reg_0');
    expect(code).toContain('user_reg_1');
    expect(code).toContain('Browser');
    expect(code).toContain('API');
    expect(code).toContain('HTTPS');
    expect(code).toContain('TB_user_reg_0');
  });

  test('_buildMermaidGraphCode returns null for empty data', () => {
    expect(agent._buildMermaidGraphCode(null)).toBeNull();
    expect(agent._buildMermaidGraphCode({ flows: [] })).toBeNull();
  });

  test('generates all formats together', async () => {
    const result = await agent.generate({
      ...sampleData,
      formats: ['markdown', 'json', 'html'],
      outputDir,
    });
    expect(result.markdown).toBeDefined();
    expect(result.json).toBeDefined();
    expect(result.html).toBeDefined();
  });
});
