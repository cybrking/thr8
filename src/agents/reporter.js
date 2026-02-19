const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

class ReporterAgent {
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
    this._registerHelpers();
  }

  _registerHelpers() {
    Handlebars.registerHelper('severityIcon', (level) => {
      const icons = { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '🟢', CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
      return icons[level] || '⚪';
    });

    Handlebars.registerHelper('riskStatusIcon', (status) => {
      const icons = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
      return icons[status] || '⚪';
    });

    Handlebars.registerHelper('add', (a, b) => a + b);
  }

  async generate({ threatModel, dataFlows, formats, outputDir, projectName }) {
    await fs.mkdir(outputDir, { recursive: true });
    const outputs = {};

    if (formats.includes('markdown')) {
      const templateSrc = await fs.readFile(path.join(this.templateDir, 'threat-model.md.hbs'), 'utf-8');
      const template = Handlebars.compile(templateSrc);
      const markdown = template({
        threatModel,
        dataFlows,
        projectName: projectName || 'Unknown Project',
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
        projectName: projectName || 'Unknown Project',
        threatModel,
        dataFlows,
      }, null, 2));
      outputs.json = jsonPath;
    }

    return outputs;
  }
}

module.exports = ReporterAgent;
