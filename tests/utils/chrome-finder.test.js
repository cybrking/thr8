const fs = require('fs');

describe('chrome-finder', () => {
  const originalEnv = process.env;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    // Clear the require cache so each test gets a fresh module
    delete require.cache[require.resolve('../../src/utils/chrome-finder')];
  });

  afterAll(() => {
    process.env = originalEnv;
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  test('returns CHROME_PATH env var when set and file exists', () => {
    process.env.CHROME_PATH = '/custom/chrome';
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => p === '/custom/chrome');
    const { findChrome } = require('../../src/utils/chrome-finder');
    expect(findChrome()).toBe('/custom/chrome');
  });

  test('ignores CHROME_PATH when file does not exist', () => {
    process.env.CHROME_PATH = '/nonexistent/chrome';
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { findChrome } = require('../../src/utils/chrome-finder');
    expect(findChrome()).toBeNull();
  });

  test('returns null when no Chrome found', () => {
    delete process.env.CHROME_PATH;
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const { findChrome } = require('../../src/utils/chrome-finder');
    expect(findChrome()).toBeNull();
  });

  test('finds platform-specific Chrome path', () => {
    delete process.env.CHROME_PATH;
    // Mock existsSync to return true for the first platform path checked
    const calls = [];
    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      calls.push(p);
      // Return true for the first platform-specific path
      return calls.length === 1;
    });
    const { findChrome } = require('../../src/utils/chrome-finder');
    const result = findChrome();
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  test('exports CHROME_PATHS with platform entries', () => {
    const { CHROME_PATHS } = require('../../src/utils/chrome-finder');
    expect(CHROME_PATHS.linux).toBeDefined();
    expect(CHROME_PATHS.darwin).toBeDefined();
    expect(CHROME_PATHS.win32).toBeDefined();
    expect(Array.isArray(CHROME_PATHS.linux)).toBe(true);
  });
});
