const core = require('@actions/core');
const path = require('path');

const TechStackAgent = require('./agents/tech-stack');
const InfrastructureAgent = require('./agents/infrastructure');
const APISurfaceAgent = require('./agents/api-surface');
const DataFlowAgent = require('./agents/data-flow');
const ThreatGeneratorAgent = require('./agents/threat-generator');
const ComplianceAgent = require('./agents/compliance');
const ReporterAgent = require('./agents/reporter');

async function run() {
  try {
    const repoPath = process.env.GITHUB_WORKSPACE;
    const apiKey = core.getInput('anthropic-api-key', { required: true });
    const frameworks = core.getInput('frameworks').split(',').map(s => s.trim()).filter(Boolean);
    const outputFormats = core.getInput('output-formats').split(',').map(s => s.trim()).filter(Boolean);
    const failOnHighRisk = core.getInput('fail-on-high-risk') === 'true';

    // Derive project name from repo
    const repoName = process.env.GITHUB_REPOSITORY || path.basename(repoPath);

    // Step 1: Parallel discovery
    core.startGroup('Analyzing repository...');
    const [techStack, infrastructure] = await Promise.all([
      new TechStackAgent().analyze(repoPath),
      new InfrastructureAgent().analyze(repoPath),
    ]);
    const apiSurface = await new APISurfaceAgent().analyze(repoPath, techStack);
    core.endGroup();

    // Step 2: Data flow analysis (PASTA Stage 3)
    core.startGroup('Mapping data flows...');
    const dataFlows = await new DataFlowAgent(apiKey).analyze({
      techStack, infrastructure, apiSurface,
    });
    core.endGroup();

    // Step 3: PASTA threat analysis (Stages 1-2, 4-6)
    core.startGroup('Generating PASTA threat analysis...');
    const threatModel = await new ThreatGeneratorAgent(apiKey).generate({
      techStack, infrastructure, apiSurface, dataFlows,
    });
    core.endGroup();

    // Step 4: Risk & compliance assessment (PASTA Stage 7)
    core.startGroup('Assessing risk & compliance...');
    const complianceResults = [];
    for (const fw of frameworks) {
      const result = await new ComplianceAgent(apiKey, fw).assess(threatModel);
      complianceResults.push(result);
    }
    core.endGroup();

    // Step 5: Generate reports
    core.startGroup('Generating reports...');
    const outputDir = path.join(repoPath, 'threat-model');
    await new ReporterAgent().generate({
      threatModel,
      dataFlows,
      complianceResults,
      formats: outputFormats,
      outputDir,
      projectName: repoName,
    });
    core.endGroup();

    // Step 6: Set outputs
    const totalVulns = threatModel.summary?.total_vulnerabilities || 0;
    const criticalCount = threatModel.summary?.critical || 0;
    const complianceScore = complianceResults[0]?.summary?.overall_score || 0;
    const riskStatus = threatModel.overall_risk_status || 'UNKNOWN';

    core.setOutput('threats-found', totalVulns);
    core.setOutput('high-risk-count', criticalCount);
    core.setOutput('compliance-score', complianceScore);
    core.setOutput('report-path', outputDir);

    // Step 7: Job summary
    await core.summary
      .addHeading('PASTA Threat Model Generated')
      .addTable([
        [{ data: 'Metric', header: true }, { data: 'Value', header: true }],
        ['Risk Status', riskStatus],
        ['Total Vulnerabilities', String(totalVulns)],
        ['Critical', String(criticalCount)],
        ['Attack Scenarios', String(threatModel.summary?.attack_scenarios || 0)],
        ['Compliance Score', `${complianceScore}%`],
      ])
      .write();

    // Step 8: Fail if needed
    if (failOnHighRisk && criticalCount > 0) {
      core.setFailed(`Found ${criticalCount} critical-risk vulnerabilities`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = { run };

// Auto-run when executed directly (not when required in tests)
if (require.main === module) {
  run();
}
