const path = require('path');
const TechStackAgent = require('../../src/agents/tech-stack');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/express-postgres');

describe('TechStackAgent', () => {
  let agent;
  beforeEach(() => { agent = new TechStackAgent(); });

  test('detects Node.js runtime from package.json', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.runtime).toEqual({ name: 'Node.js', version: null });
  });

  test('detects Express framework', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.framework).toEqual({ name: 'Express', version: '^4.18.2' });
  });

  test('detects PostgreSQL database via pg client', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.databases).toContainEqual(
      expect.objectContaining({ type: 'PostgreSQL', client: 'pg@^8.11.0' })
    );
  });

  test('detects Redis database via ioredis', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.databases).toContainEqual(
      expect.objectContaining({ type: 'Redis', client: 'ioredis@^5.3.0' })
    );
  });

  test('detects JWT authentication', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.authentication).toContainEqual(
      expect.objectContaining({ type: 'JWT', library: 'jsonwebtoken@^9.0.0' })
    );
  });

  test('detects OAuth2 via passport', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.authentication).toContainEqual(
      expect.objectContaining({ type: 'OAuth2', library: 'passport-google-oauth20@^2.0.0' })
    );
  });

  test('detects Stripe external service', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.external_services).toContainEqual(
      expect.objectContaining({ name: 'Stripe', sdk: 'stripe@^12.0.0' })
    );
  });

  test('detects AWS S3 external service', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.external_services).toContainEqual(
      expect.objectContaining({ name: 'AWS S3', sdk: '@aws-sdk/client-s3@^3.0.0' })
    );
  });

  test('detects helmet security library', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.security_libraries).toContainEqual(
      expect.objectContaining({ name: 'helmet', purpose: 'HTTP headers' })
    );
  });

  test('detects bcrypt security library', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.security_libraries).toContainEqual(
      expect.objectContaining({ name: 'bcrypt', purpose: 'Password hashing' })
    );
  });

  test('returns empty arrays when no package.json found', async () => {
    const result = await agent.analyze('/nonexistent/path');
    expect(result.databases).toEqual([]);
    expect(result.authentication).toEqual([]);
    expect(result.external_services).toEqual([]);
    expect(result.security_libraries).toEqual([]);
  });
});
