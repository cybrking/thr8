const { MermaidRenderer, MERMAID_CDN } = require('../../src/utils/mermaid-renderer');

describe('MermaidRenderer', () => {
  function createMockBrowser({ evaluateResult = '<svg>mock</svg>', shouldFail = false } = {}) {
    const mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      evaluate: shouldFail
        ? jest.fn().mockRejectedValue(new Error('render failed'))
        : jest.fn().mockResolvedValue(evaluateResult),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
    };
    return { mockBrowser, mockPage };
  }

  test('renders Mermaid code to SVG', async () => {
    const { mockBrowser, mockPage } = createMockBrowser({ evaluateResult: '<svg>test-diagram</svg>' });
    const renderer = new MermaidRenderer(mockBrowser);

    const result = await renderer.render('graph LR\n  A --> B');

    expect(result).toBe('<svg>test-diagram</svg>');
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.setContent).toHaveBeenCalledWith(
      expect.stringContaining(MERMAID_CDN),
      expect.any(Object)
    );
    expect(mockPage.evaluate).toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('returns null on render failure', async () => {
    const { mockBrowser, mockPage } = createMockBrowser({ shouldFail: true });
    const renderer = new MermaidRenderer(mockBrowser);

    const result = await renderer.render('invalid code');

    expect(result).toBeNull();
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('closes page even on error', async () => {
    const { mockBrowser, mockPage } = createMockBrowser({ shouldFail: true });
    const renderer = new MermaidRenderer(mockBrowser);

    await renderer.render('graph LR');

    expect(mockPage.close).toHaveBeenCalled();
  });

  test('renderMultiple renders all diagrams', async () => {
    const { mockBrowser } = createMockBrowser({ evaluateResult: '<svg>ok</svg>' });
    const renderer = new MermaidRenderer(mockBrowser);

    const results = await renderer.renderMultiple({
      dfd: 'graph LR\n  A --> B',
      seq: 'sequenceDiagram\n  A->>B: msg',
    });

    expect(results.dfd).toBe('<svg>ok</svg>');
    expect(results.seq).toBe('<svg>ok</svg>');
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(2);
  });

  test('renderMultiple handles partial failures', async () => {
    let callCount = 0;
    const mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve('<svg>ok</svg>');
        return Promise.reject(new Error('fail'));
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage) };
    const renderer = new MermaidRenderer(mockBrowser);

    const results = await renderer.renderMultiple({
      good: 'graph LR',
      bad: 'invalid',
    });

    expect(results.good).toBe('<svg>ok</svg>');
    expect(results.bad).toBeNull();
  });

  test('exports MERMAID_CDN constant', () => {
    expect(MERMAID_CDN).toContain('mermaid');
    expect(MERMAID_CDN).toContain('cdn');
  });
});
