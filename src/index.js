const core = require('@actions/core');
const path = require('path');

const CodebaseScannerAgent = require('./agents/codebase-scanner');
const ThreatGeneratorAgent = require('./agents/threat-generator');
const ReporterAgent = require('./agents/reporter');

async function run() {
  try {
    const repoPath = process.env.GITHUB_WORKSPACE;
    const apiKey = core.getInput('anthropic-api-key', { required: true });
    const outputFormats = core.getInput('output-formats').split(',').map(s => s.trim()).filter(Boolean);
    const failOnHighRisk = core.getInput('fail-on-high-risk') === 'true';

    // Derive project name from repo
    const repoName = process.env.GITHUB_REPOSITORY || path.basename(repoPath);

    // Step 1: Scan codebase + map data flows (PASTA Stage 3)
    core.startGroup('Scanning codebase...');
    const { systemContext, dataFlows, filesScanned } = await new CodebaseScannerAgent(apiKey).analyze(repoPath);
    core.info(`Scanned ${filesScanned} files`);
    core.endGroup();

    // Step 2: PASTA threat analysis (Stages 1-2, 4-7)
    core.startGroup('Generating PASTA threat analysis...');
    const threatModel = await new ThreatGeneratorAgent(apiKey).generate({
      systemContext, dataFlows,
    });
    core.endGroup();

    // Step 3: Generate reports
    core.startGroup('Generating reports...');
    const outputDir = path.join(repoPath, 'threat-model');
    await new ReporterAgent().generate({
      threatModel,
      dataFlows,
      formats: outputFormats,
      outputDir,
      projectName: repoName,
    });
    core.endGroup();

    // Step 4: Set outputs
    const totalVulns = threatModel.summary?.total_vulnerabilities || 0;
    const criticalCount = threatModel.summary?.critical || 0;
    const riskStatus = threatModel.overall_risk_status || 'UNKNOWN';

    core.setOutput('threats-found', totalVulns);
    core.setOutput('high-risk-count', criticalCount);
    core.setOutput('report-path', outputDir);

    // Step 5: Job summary
    await core.summary
      .addHeading('PASTA Threat Model Generated')
      .addTable([
        [{ data: 'Metric', header: true }, { data: 'Value', header: true }],
        ['Risk Status', riskStatus],
        ['Files Scanned', String(filesScanned)],
        ['Total Vulnerabilities', String(totalVulns)],
        ['Critical', String(criticalCount)],
        ['Attack Scenarios', String(threatModel.summary?.attack_scenarios || 0)],
      ])
      .write();

    // Step 6: Fail if needed
    if (failOnHighRisk && criticalCount > 0) {
      core.setFailed(`Found ${criticalCount} critical-risk vulnerabilities`);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
