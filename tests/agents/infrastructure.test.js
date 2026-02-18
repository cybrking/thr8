const path = require('path');
const InfrastructureAgent = require('../../src/agents/infrastructure');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/express-postgres');

describe('InfrastructureAgent', () => {
  let agent;
  beforeEach(() => { agent = new InfrastructureAgent(); });

  test('detects AWS provider from Terraform', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.provider).toBe('AWS');
  });

  test('detects ECS Fargate compute', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.compute).toContainEqual(expect.objectContaining({ type: 'ECS Fargate' }));
  });

  test('detects VPC networking', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.networking.vpc_cidr).toBe('10.0.0.0/16');
  });

  test('detects security groups', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.networking.security_groups.length).toBeGreaterThan(0);
    expect(result.networking.security_groups).toContainEqual(expect.objectContaining({ name: 'web-sg' }));
  });

  test('detects RDS data store with encryption', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.data_stores).toContainEqual(expect.objectContaining({
      type: 'RDS PostgreSQL',
      encryption_at_rest: true,
      multi_az: true,
      public: false,
    }));
  });

  test('detects S3 bucket', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.data_stores).toContainEqual(expect.objectContaining({ type: 'S3' }));
  });

  test('detects Secrets Manager', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.secrets).toEqual(expect.objectContaining({ type: 'AWS Secrets Manager' }));
  });

  test('detects CloudWatch monitoring', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.monitoring).toContain('CloudWatch Logs');
  });

  test('detects Docker Compose services', async () => {
    const result = await agent.analyze(FIXTURE_PATH);
    expect(result.docker_services).toContainEqual(expect.objectContaining({ name: 'api' }));
  });

  test('returns empty structure for path with no IaC', async () => {
    const result = await agent.analyze('/nonexistent/path');
    expect(result.provider).toBeNull();
    expect(result.compute).toEqual([]);
    expect(result.data_stores).toEqual([]);
  });
});
