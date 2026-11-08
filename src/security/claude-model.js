/**
 * Claude models the Action may call.
 *
 * IDs, thinking modes, and effort defaults were checked against the Claude API
 * docs on 2026-11-08:
 * - https://platform.claude.com/docs/en/models/sonnet-5-5/overview
 * - https://platform.claude.com/docs/en/models/opus-5-5/overview
 * - https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
 * - https://platform.claude.com/docs/en/models/opus-5-5/migration-guide
 *
 * Requests go through @anthropic-ai/sdk 1.6.0, which sends anthropic-version
 * 2026-10-21. That header is the version used by the Sonnet 5.5 migration
 * examples. SDK 1.0.0 (2026-10-21) introduced it; 0.135.0 does not send it.
 *
 * The Action never substitutes a model. Unknown IDs throw. Server-side
 * fallbacks are not enabled, because a fallback would retry a refusal on a
 * different model.
 */

const DEFAULT_MODEL_ID = 'claude-sonnet-5-5';

// Verified with Anthropic SDK 1.6.0 calculateNonstreamingTimeout:
// 21333 is accepted and 21334 throws "Streaming is required...".
// Model-specific MODEL_NONSTREAMING_TOKENS does not list these 5.5 IDs.
const NONSTREAMING_MAX_TOKENS = 21333;

// Previous hardcoded request, retained so the offline harness can show what
// changed. It is not a supported Action input. Sonnet 4.6 rejects
// thinking.type "between_tools", so this shape must not be reused for 5.5.
const HISTORICAL_SONNET_46 = {
  id: 'claude-sonnet-4-6',
  supported: false,
  thinking: null,
  output_config: null,
  maxTokens: { analysis: 16384, remediation: 8192 },
};

// Sonnet 5.5 prices published with the model: $2 / $10 per million input/output
// tokens. Opus 5.5: $4 / $20. Thinking tokens are billed as output tokens.
const MODELS = {
  'claude-sonnet-5-5': {
    id: 'claude-sonnet-5-5',
    // Up-front thinking is on when `thinking` is omitted, and `disabled` is a
    // 400. `between_tools` is the lowest setting, is valid at high effort, and
    // returns only text when the request has no tools. That keeps the prior
    // no-up-front-thinking behavior. max_tokens is the old text budget grown
    // by the published ~30% tokenizer increase versus Sonnet 4.6, and stays
    // inside the non-streaming ceiling (16384 * 1.3 = 21299, 8192 * 1.3 = 10650).
    thinking: { type: 'between_tools' },
    output_config: { effort: 'high' },
    maxTokens: { analysis: 21299, remediation: 10650 },
  },
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    // Adaptive thinking is always on. `between_tools` and `disabled` are 400.
    // Effort `medium` is the documented Opus 5.5 default. 64000 is the
    // published starting max_tokens for workloads that must leave room to
    // think; it is a ceiling, not a measured medium-effort budget, and it
    // requires streaming because it exceeds the SDK non-streaming limit.
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    maxTokens: { analysis: 64000, remediation: 64000 },
  },
};

function resolveClaudeModel(input) {
  const requested = typeof input === 'string' ? input.trim() : '';
  const id = requested || DEFAULT_MODEL_ID;
  const profile = MODELS[id];
  if (!profile) {
    throw new Error(
      `Unsupported model "${id}". Supported models: claude-sonnet-5-5 (default), claude-opus-5-5. The Action does not substitute a different model.`
    );
  }
  return profile;
}

function messageParams(profile, role) {
  if (!profile || !MODELS[profile.id]) {
    throw new Error('Unsupported model profile. The Action does not substitute a different model.');
  }
  if (role !== 'analysis' && role !== 'remediation') {
    throw new Error(`Unknown model request role: ${role}`);
  }
  return {
    model: profile.id,
    max_tokens: profile.maxTokens[role],
    thinking: profile.thinking,
    output_config: profile.output_config,
  };
}

function usesStreaming(maxTokens) {
  return maxTokens > NONSTREAMING_MAX_TOKENS;
}

module.exports = {
  DEFAULT_MODEL_ID,
  NONSTREAMING_MAX_TOKENS,
  HISTORICAL_SONNET_46,
  MODELS,
  resolveClaudeModel,
  messageParams,
  usesStreaming,
};
