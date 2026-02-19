const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');
const { findChrome } = require('../utils/chrome-finder');

class ReporterAgent {
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
    this._browser = null;
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

    Handlebars.registerHelper('lowercase', (str) => {
      return str ? String(str).toLowerCase() : '';
    });

    Handlebars.registerHelper('severityClass', (level) => {
      return level ? String(level).toLowerCase() : '';
    });
  }

  _buildMermaidGraphCode(dataFlows) {
    if (!dataFlows?.flows?.length) return null;
    const lines = ['graph LR'];
    for (const flow of dataFlows.flows) {
      if (!flow.steps) continue;
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        lines.push(`    ${flow.id}_${i}["${step.component}<br/><i>${step.type}</i>"]`);
      }
      for (let i = 0; i < flow.steps.length - 1; i++) {
        const protocol = flow.steps[i].protocol || 'internal';
        lines.push(`    ${flow.id}_${i} -->|"${protocol}"| ${flow.id}_${i + 1}`);
      }
      if (flow.trust_boundaries) {
        for (let j = 0; j < flow.trust_boundaries.length; j++) {
          const tb = flow.trust_boundaries[j];
          lines.push(`    TB_${flow.id}_${j}[/"${tb.from} → ${tb.to}: ${tb.control}"/]`);
        }
      }
    }
    return lines.join('\n');
  }

  async _getOrCreateBrowser() {
    if (this._browser) return this._browser;

    let puppeteer;
    try {
      puppeteer = require('puppeteer-core');
    } catch {
      return null;
    }

    const chromePath = findChrome();
    if (!chromePath) return null;

    try {
      this._browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      return this._browser;
    } catch {
      return null;
    }
  }

  async _closeBrowser() {
    if (this._browser) {
      await this._browser.close().catch(() => {});
      this._browser = null;
    }
  }

  async _generateHtml({ threatModel, dataFlows, outputDir, projectName }) {
    const mermaidCode = this._buildMermaidGraphCode(dataFlows);
    let diagramSvg = null;

    // Try to pre-render Mermaid to SVG
    if (mermaidCode) {
      const browser = await this._getOrCreateBrowser();
      if (browser) {
        const { MermaidRenderer } = require('../utils/mermaid-renderer');
        const renderer = new MermaidRenderer(browser);
        diagramSvg = await renderer.render(mermaidCode);
      }
    }

    const templateSrc = await fs.readFile(
      path.join(this.templateDir, 'threat-model.html.hbs'), 'utf-8'
    );
    const template = Handlebars.compile(templateSrc);
    const html = template({
      threatModel,
      dataFlows,
      projectName: projectName || 'Unknown Project',
      generatedDate: new Date().toISOString().split('T')[0],
      mermaidCode: mermaidCode || '',
      diagramSvg,
    });

    const htmlPath = path.join(outputDir, 'THREAT_MODEL.html');
    await fs.writeFile(htmlPath, html);
    return htmlPath;
  }

  async _generatePdf({ htmlPath, outputDir }) {
    const browser = await this._getOrCreateBrowser();
    if (!browser) return null;

    let page;
    try {
      page = await browser.newPage();
      const fileUrl = `file://${path.resolve(htmlPath)}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      const pdfPath = path.join(outputDir, 'THREAT_MODEL.pdf');
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;text-align:center;font-size:9pt;color:#6b7294;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      });
      return pdfPath;
    } catch {
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  async generate({ threatModel, dataFlows, formats, outputDir, projectName }) {
    await fs.mkdir(outputDir, { recursive: true });
    const outputs = {};

    try {
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

      // HTML is always generated alongside other formats
      const htmlPath = await this._generateHtml({ threatModel, dataFlows, outputDir, projectName });
      outputs.html = htmlPath;

      if (formats.includes('pdf')) {
        const pdfPath = await this._generatePdf({ htmlPath: outputs.html, outputDir });
        if (pdfPath) {
          outputs.pdf = pdfPath;
        }
      }
    } finally {
      await this._closeBrowser();
    }

    return outputs;
  }
}

module.exports = ReporterAgent;
