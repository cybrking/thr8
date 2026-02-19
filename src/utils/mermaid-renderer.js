const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

class MermaidRenderer {
  constructor(browser) {
    this.browser = browser;
  }

  async render(mermaidCode) {
    let page;
    try {
      page = await this.browser.newPage();
      await page.setContent(`
        <!DOCTYPE html>
        <html><head><script src="${MERMAID_CDN}"></script></head>
        <body><div id="container"></div></body></html>
      `, { waitUntil: 'networkidle0', timeout: 15000 });

      const svg = await page.evaluate(async (code) => {
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
        const { svg } = await mermaid.render('diagram', code);
        return svg;
      }, mermaidCode);

      return svg;
    } catch (err) {
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  async renderMultiple(diagrams) {
    const results = {};
    for (const [key, code] of Object.entries(diagrams)) {
      results[key] = await this.render(code);
    }
    return results;
  }
}

module.exports = { MermaidRenderer, MERMAID_CDN };
