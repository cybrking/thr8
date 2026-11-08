const path = require('path');
const { compareModels } = require('../../eval/model-comparison');

const FIXTURE = path.join(__dirname, '../fixtures/express-postgres');

describe('offline model comparison harness', () => {
  const report = compareModels(FIXTURE);

  test('compares request shapes and does not claim a live evaluation', () => {
    expect(report.liveEvaluation).toBe(false);
    expect(report.limitations.join(' ')).toContain('No Anthropic API call');
    expect(report.historical.id).toBe('claude-sonnet-4-6');
    expect(report.historical.analysis).toMatchObject({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      thinking: null,
      output_config: null,
      transport: 'messages.create',
    });
    const sonnet = report.proposed.find(model => model.id === 'claude-sonnet-5-5');
    const opus = report.proposed.find(model => model.id === 'claude-opus-5-5');
    expect(sonnet.analysis).toMatchObject({
      model: 'claude-sonnet-5-5',
      thinking: { type: 'between_tools' },
      output_config: { effort: 'high' },
      transport: 'messages.create',
    });
    expect(opus.analysis).toMatchObject({
      model: 'claude-opus-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      max_tokens: 64000,
      transport: 'messages.stream',
      fallbacks: false,
    });
    expect(sonnet.analysis.max_tokens).toBeGreaterThan(report.historical.analysis.max_tokens);
    expect(report.promptDifference).toContain('share the discovery, generation, and remediation prompts');
  });

  test('checks representative fixture facts without scoring a model', () => {
    const facts = Object.fromEntries(report.observableFacts.map(fact => [fact.id, fact]));
    expect(facts['users-post-omits-auth-middleware'].holds).toBe(true);
    expect(facts['payments-post-uses-auth-and-limiter'].holds).toBe(true);
    expect(facts['auth-middleware-file-absent'].holds).toBe(true);
    expect(facts['compose-database-url-contains-password'].holds).toBe(true);
    expect(facts['terraform-open-https-and-private-database'].holds).toBe(true);
    expect(facts['app-mounts-users-and-payments-behind-helmet'].holds).toBe(true);
    expect(facts['fixture-source-has-no-sql-statements'].holds).toBe(true);
    expect(report.observableFacts.every(fact => fact.holds)).toBe(true);
  });
});
