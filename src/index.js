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
    const reportOutputs = await new ReporterAgent().generate({
      threatModel,
      dataFlows,
      formats: outputFormats,
      outputDir,
      projectName: repoName,
    });

    core.info(`HTML report generated: ${reportOutputs.html}`);
    if (reportOutputs.pdf) {
      core.info(`PDF report generated: ${reportOutputs.pdf}`);
    } else if (outputFormats.includes('pdf')) {
      core.warning('PDF generation skipped — Chrome not available. HTML report contains Mermaid.js CDN fallback.');
    }
    core.info('Tip: Use actions/upload-artifact to persist HTML/PDF reports as workflow artifacts.');
    core.endGroup();

    // Step 4: Set outputs
    const totalVulns = threatModel.summary?.total_vulnerabilities || 0;
    const criticalCount = threatModel.summary?.critical || 0;
    const riskStatus = threatModel.overall_risk_status || 'UNKNOWN';

    core.setOutput('threats-found', totalVulns);
    core.setOutput('high-risk-count', criticalCount);
    core.setOutput('report-path', outputDir);

    // Step 5: Job summary
    const highCount = threatModel.summary?.high || 0;
    const mediumCount = threatModel.summary?.medium || 0;
    const lowCount = threatModel.summary?.low || 0;

    const riskOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const priorityOrder = { Immediate: 0, 'Short-term': 1 };

    // Section 1 — Overall Risk
    core.summary
      .addHeading('PASTA Threat Model Results', 1)
      .addRaw(`**Overall Risk: ${riskStatus}**\n\n`);

    // Section 2 — Top Risks (sorted Critical → Low)
    const allRisks = [...(threatModel.risk_analysis || [])].sort(
      (a, b) => (riskOrder[a.pasta_level] ?? 9) - (riskOrder[b.pasta_level] ?? 9)
    );
    if (allRisks.length > 0) {
      core.summary
        .addHeading('Top Risks', 3)
        .addTable([
          [
            { data: 'Risk', header: true },
            { data: 'Level', header: true },
            { data: 'Business Impact', header: true },
            { data: 'Fix Complexity', header: true },
          ],
          ...allRisks.map(r => [r.title, r.pasta_level, r.business_impact, r.mitigation_complexity]),
        ]);
    }

    // Section 3 — Recommended Actions (sorted Immediate → Short-term)
    const urgentActions = (threatModel.tactical_recommendations || [])
      .filter(r => r.priority === 'Immediate' || r.priority === 'Short-term')
      .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
    if (urgentActions.length > 0) {
      core.summary
        .addHeading('Recommended Actions', 3)
        .addTable([
          [
            { data: 'Priority', header: true },
            { data: 'Action', header: true },
            { data: 'Addresses', header: true },
          ],
          ...urgentActions.map(r => [r.priority, r.action, (r.addresses || []).join(', ')]),
        ]);
    }

    // Section 4 — Attack Scenarios (collapsible, HTML table)
    const scenarios = threatModel.attack_scenarios || [];
    if (scenarios.length > 0) {
      const scenarioRows = scenarios.map(s =>
        `<tr><td><strong>${s.name}</strong></td><td>${s.objective}</td></tr>`
      ).join('\n');
      const scenarioTable = `<table>\n<tr><th>Scenario</th><th>Objective</th></tr>\n${scenarioRows}\n</table>`;
      core.summary.addDetails('Attack Scenarios', scenarioTable);
    }

    await core.summary.write();

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
