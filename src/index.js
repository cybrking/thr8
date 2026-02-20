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
    const attackScenarios = threatModel.summary?.attack_scenarios || 0;
    const attackSurfaces = threatModel.summary?.attack_surfaces || 0;

    const riskEmoji = { CRITICAL: '\uD83D\uDD34', HIGH: '\uD83D\uDFE0', MEDIUM: '\uD83D\uDFE1', LOW: '\uD83D\uDFE2' }[riskStatus] || '\u26AA';

    // Section 1 — Header + Risk Banner
    core.summary
      .addHeading('PASTA Threat Model Results', 1)
      .addRaw(`${riskEmoji} **Overall Risk: ${riskStatus}**\n\n`);

    // Section 2 — Metrics Bar
    core.summary.addTable([
      [
        { data: 'Files Scanned', header: true },
        { data: 'Vulnerabilities', header: true },
        { data: 'Critical', header: true },
        { data: 'High', header: true },
        { data: 'Medium', header: true },
        { data: 'Low', header: true },
        { data: 'Attack Scenarios', header: true },
        { data: 'Attack Surfaces', header: true },
      ],
      [
        String(filesScanned), String(totalVulns), String(criticalCount), String(highCount),
        String(mediumCount), String(lowCount), String(attackScenarios), String(attackSurfaces),
      ],
    ]);

    // Collect all vulnerabilities with their attack surface context
    const allVulns = (threatModel.attack_surfaces || []).flatMap(surface =>
      (surface.vulnerabilities || []).map(v => ({ ...v, surface: surface.name }))
    );

    // Section 3 — Critical & High Vulnerabilities
    const critHighVulns = allVulns.filter(v => v.severity === 'Critical' || v.severity === 'High');
    if (critHighVulns.length > 0) {
      core.summary
        .addSeparator()
        .addHeading('Critical & High Vulnerabilities', 3)
        .addTable([
          [
            { data: 'Severity', header: true },
            { data: 'ID', header: true },
            { data: 'Title', header: true },
            { data: 'Attack Surface', header: true },
          ],
          ...critHighVulns.map(v => [v.severity, v.id, v.title, v.surface]),
        ]);
    }

    // Section 4 — Top Risks
    const topRisks = (threatModel.risk_analysis || []).filter(
      r => r.pasta_level === 'Critical' || r.pasta_level === 'High'
    );
    if (topRisks.length > 0) {
      core.summary
        .addSeparator()
        .addHeading('Top Risks', 3)
        .addTable([
          [
            { data: 'Risk', header: true },
            { data: 'Level', header: true },
            { data: 'Business Impact', header: true },
            { data: 'Fix Complexity', header: true },
          ],
          ...topRisks.map(r => [r.title, r.pasta_level, r.business_impact, r.mitigation_complexity]),
        ]);
    }

    // Section 5 — Recommended Actions
    const urgentActions = (threatModel.tactical_recommendations || []).filter(
      r => r.priority === 'Immediate' || r.priority === 'Short-term'
    );
    if (urgentActions.length > 0) {
      core.summary
        .addSeparator()
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

    // Section 6 — Attack Scenarios (collapsible)
    const scenarios = threatModel.attack_scenarios || [];
    if (scenarios.length > 0) {
      const scenarioList = scenarios.map(s => `- **${s.name}** — ${s.objective}`).join('\n');
      core.summary.addDetails('Attack Scenarios', scenarioList);
    }

    // Section 7 — Medium & Low Vulnerabilities (collapsible)
    const medLowVulns = allVulns.filter(v => v.severity === 'Medium' || v.severity === 'Low');
    if (medLowVulns.length > 0) {
      const rows = medLowVulns.map(v =>
        `<tr><td>${v.severity}</td><td>${v.id}</td><td>${v.title}</td><td>${v.surface}</td></tr>`
      ).join('\n');
      const table = `<table><tr><th>Severity</th><th>ID</th><th>Title</th><th>Attack Surface</th></tr>\n${rows}\n</table>`;
      core.summary.addDetails('Medium & Low Vulnerabilities', table);
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
