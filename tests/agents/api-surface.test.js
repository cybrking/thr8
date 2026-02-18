const path = require('path');
const APISurfaceAgent = require('../../src/agents/api-surface');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/express-postgres');

describe('APISurfaceAgent', () => {
  let agent;
  beforeEach(() => { agent = new APISurfaceAgent(); });

  test('discovers Express route files', async () => {
    const result = await agent.analyze(FIXTURE_PATH, { framework: { name: 'Express' } });
    expect(result.endpoints.length).toBeGreaterThan(0);
  });

  test('detects POST routes', async () => {
    const result = await agent.analyze(FIXTURE_PATH, { framework: { name: 'Express' } });
    const postRoutes = result.endpoints.filter(e => e.method === 'POST');
    expect(postRoutes.length).toBeGreaterThan(0);
  });

  test('detects GET routes', async () => {
    const result = await agent.analyze(FIXTURE_PATH, { framework: { name: 'Express' } });
    const getRoutes = result.endpoints.filter(e => e.method === 'GET');
    expect(getRoutes.length).toBeGreaterThan(0);
  });

  test('detects middleware in route chain', async () => {
    const result = await agent.analyze(FIXTURE_PATH, { framework: { name: 'Express' } });
    const authRoutes = result.endpoints.filter(e => e.middleware && e.middleware.includes('auth'));
    expect(authRoutes.length).toBeGreaterThan(0);
  });

  test('returns empty endpoints for unknown framework', async () => {
    const result = await agent.analyze(FIXTURE_PATH, { framework: { name: 'Unknown' } });
    expect(result.endpoints).toEqual([]);
  });
});
