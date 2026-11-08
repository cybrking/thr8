const Anthropic = require('@anthropic-ai/sdk');
const {
  NONSTREAMING_MAX_TOKENS,
  HISTORICAL_SONNET_46,
  resolveClaudeModel,
  messageParams,
  usesStreaming,
  requestTimeoutMs,
} = require('../../src/security/claude-model');

describe('Claude model selection', () => {
  test('defaults to Sonnet 5.5 and accepts only the verified Opus override', () => {
    expect(resolveClaudeModel('').id).toBe('claude-sonnet-5-5');
    expect(resolveClaudeModel('  claude-opus-5-5  ').id).toBe('claude-opus-5-5');
    expect(messageParams(resolveClaudeModel(''), 'analysis')).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 21299,
      thinking: { type: 'between_tools' },
      output_config: { effort: 'high' },
    });
    expect(messageParams(resolveClaudeModel('claude-opus-5-5'), 'remediation').thinking).toEqual({ type: 'adaptive' });
  });

  test('rejects the previous hardcoded model and unknown IDs without substitution', () => {
    expect(() => resolveClaudeModel('claude-sonnet-4-6')).toThrow('does not substitute');
    expect(() => resolveClaudeModel('claude-opus-5')).toThrow('Unsupported model');
    expect(() => resolveClaudeModel('CLAUDE-SONNET-5-5')).toThrow('Unsupported model');
    for (const inherited of ['constructor', 'toString', '__proto__', 'valueOf']) {
      expect(() => resolveClaudeModel(inherited)).toThrow('does not substitute');
    }
    expect(() => resolveClaudeModel(function model() {})).toThrow('does not substitute');
    expect(resolveClaudeModel({ id: 'claude-opus-5-5' }).id).toBe('claude-opus-5-5');
    expect(HISTORICAL_SONNET_46.supported).toBe(false);
    expect(HISTORICAL_SONNET_46.maxTokens.analysis).toBe(16384);
  });

  test('keeps Sonnet under the installed SDK non-streaming ceiling and streams Opus', () => {
    const client = new Anthropic({ apiKey: 'test-key-not-used' });
    expect(usesStreaming(NONSTREAMING_MAX_TOKENS)).toBe(false);
    expect(() => client.calculateNonstreamingTimeout(NONSTREAMING_MAX_TOKENS)).not.toThrow();
    expect(() => client.calculateNonstreamingTimeout(NONSTREAMING_MAX_TOKENS + 1)).toThrow(/Streaming is required/);
    expect(usesStreaming(21299)).toBe(false);
    expect(usesStreaming(64000)).toBe(true);
    expect(requestTimeoutMs(64000)).toBe(30 * 60 * 1000);
    expect(requestTimeoutMs(21299)).toBe(10 * 60 * 1000);
    const headerSource = require('fs').readFileSync(
      require.resolve('@anthropic-ai/sdk/client.js'),
      'utf8'
    );
    expect(headerSource).toContain("'anthropic-version': '2026-10-21'");
  });
});
