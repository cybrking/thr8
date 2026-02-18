const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class ReporterAgent {
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
    this._registerHelpers();
  }

  _registerHelpers() {
    Handlebars.registerHelper('statusIcon', (status) => {
      const icons = { compliant: '✅', implemented: '✅', partial: '⚠️', missing: '❌', non_compliant: '❌' };
      return icons[status] || '❓';
    });

    Handlebars.registerHelper('add', (a, b) => a + b);
  }

  async generate({ threatModel, dataFlows, complianceResults, formats, outputDir }) {
    await fs.mkdir(outputDir, { recursive: true });
    const outputs = {};

    // Generate recommendations from threat model
    const recommendations = this._generateRecommendations(threatModel, complianceResults);

    if (formats.includes('markdown')) {
      const templateSrc = await fs.readFile(path.join(this.templateDir, 'threat-model.md.hbs'), 'utf-8');
      const template = Handlebars.compile(templateSrc);
      const markdown = template({
        threatModel,
        dataFlows,
        complianceResults,
        recommendations,
        generatedDate: new Date().toISOString().split('T')[0],
      });
      const mdPath = path.join(outputDir, 'THREAT_MODEL.md');
      await fs.writeFile(mdPath, markdown);
      outputs.markdown = mdPath;
    }

    if (formats.includes('json')) {
      const jsonPath = path.join(outputDir, 'threat-model.json');
      await fs.writeFile(jsonPath, JSON.stringify({
        generated: new Date().toISOString(),
        threatModel,
        dataFlows,
        complianceResults,
        recommendations,
      }, null, 2));
      outputs.json = jsonPath;
    }

    return outputs;
  }

  _generateRecommendations(threatModel, complianceResults) {
    const recommendations = [];
    // Extract unmitigated threats as recommendations
    // Group by priority (critical/high/medium)
    const critical = [];
    const high = [];
    const medium = [];

    if (threatModel?.components) {
      for (const comp of threatModel.components) {
        for (const threat of comp.threats || []) {
          const unmitigated = (threat.mitigations || []).filter(m => m.status === 'missing');
          if (unmitigated.length > 0) {
            const item = { title: threat.title, description: unmitigated.map(m => m.recommendation || m.control).join('; ') };
            if (threat.risk_score >= 9) critical.push(item);
            else if (threat.risk_score >= 7) high.push(item);
            else medium.push(item);
          }
        }
      }
    }

    if (critical.length) recommendations.push({ priority: 'Critical', items: critical });
    if (high.length) recommendations.push({ priority: 'High', items: high });
    if (medium.length) recommendations.push({ priority: 'Medium', items: medium });

    return recommendations;
  }
}

module.exports = ReporterAgent;
