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

    // Step 1: Parallel discovery
    core.startGroup('Analyzing repository...');
    const [techStack, infrastructure] = await Promise.all([
      new TechStackAgent().analyze(repoPath),
      new InfrastructureAgent().analyze(repoPath),
    ]);
    const apiSurface = await new APISurfaceAgent().analyze(repoPath, techStack);
    core.endGroup();

    // Step 2: Data flow analysis
    core.startGroup('Mapping data flows...');
    const dataFlows = await new DataFlowAgent(apiKey).analyze({
      techStack, infrastructure, apiSurface,
    });
    core.endGroup();

    // Step 3: Threat generation
    core.startGroup('Generating threat model...');
    const threatModel = await new ThreatGeneratorAgent(apiKey).generate({
      techStack, infrastructure, apiSurface, dataFlows,
    });
    core.endGroup();

    // Step 4: Compliance mapping
    core.startGroup('Assessing compliance...');
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
    });
    core.endGroup();

    // Step 6: Set outputs
    const totalThreats = threatModel.summary?.total_threats || 0;
    const highRiskCount = threatModel.summary?.unmitigated_high_risk || 0;
    const complianceScore = complianceResults[0]?.summary?.overall_score || 0;

    core.setOutput('threats-found', totalThreats);
    core.setOutput('high-risk-count', highRiskCount);
    core.setOutput('compliance-score', complianceScore);
    core.setOutput('report-path', outputDir);

    // Step 7: Job summary
    await core.summary
      .addHeading('Threat Model Generated')
      .addTable([
        [{ data: 'Metric', header: true }, { data: 'Value', header: true }],
        ['Total Threats', String(totalThreats)],
        ['High Risk (Unmitigated)', String(highRiskCount)],
        ['Compliance Score', `${complianceScore}%`],
      ])
      .write();

    // Step 8: Fail if needed
    if (failOnHighRisk && highRiskCount > 0) {
      core.setFailed(`Found ${highRiskCount} unmitigated high-risk threats`);
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
