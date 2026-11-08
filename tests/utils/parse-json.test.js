const {
  parseJsonResponse,
  callWithContinuation,
  readCompleteText,
} = require('../../src/utils/parse-json');

function message(text, stopReason = 'end_turn', extra = {}) {
  return {
    content: [
      ...(extra.thinking ? [{ type: 'thinking', thinking: '', signature: extra.thinking }] : []),
      { type: 'text', text },
    ],
    stop_reason: stopReason,
    stop_details: extra.stop_details,
  };
}

describe('parseJsonResponse', () => {
  test('reads fenced JSON and ignores surrounding prose', () => {
    expect(parseJsonResponse('Note:\n```json\n{"ok":true}\n```\nThanks')).toEqual({ ok: true });
  });

  test('does not repair truncated JSON into an object', () => {
    expect(() => parseJsonResponse('{"vulnerabilities":[{"id":"V-1"')).toThrow('Unreadable model JSON');
    expect(() => parseJsonResponse('')).toThrow('empty text');
  });
});

describe('readCompleteText', () => {
  test('joins text blocks and skips thinking blocks', () => {
    const text = readCompleteText({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
    });
    expect(text).toBe('{"a":1}');
  });

  test('rejects a refusal even when the text is valid JSON', () => {
    expect(() => readCompleteText(message('{"overall_risk_status":"LOW"}', 'refusal', {
      stop_details: { category: 'cyber' },
    }))).toThrow('Model refused the request (cyber)');
  });

  test('rejects truncation, a context-window stop, and an unknown stop', () => {
    expect(() => readCompleteText(message('{"ok":true}', 'max_tokens'))).toThrow('truncated before completion');
    expect(() => readCompleteText(message('', 'model_context_window_exceeded'))).toThrow('context window');
    expect(() => readCompleteText(message('{"ok":true}', 'tool_use'))).toThrow('unusable reason: tool_use');
  });
});

describe('callWithContinuation', () => {
  test('continues a truncated response and passes thinking blocks back unchanged', async () => {
    const first = message('{"ok":', 'max_tokens', { thinking: 'signed' });
    const second = message('true}', 'end_turn');
    const create = jest.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const text = await callWithContinuation(
      { messages: { create, stream: jest.fn() } },
      { max_tokens: 100, messages: [{ role: 'user', content: 'analyze' }] }
    );
    expect(text).toBe('{"ok":true}');
    expect(parseJsonResponse(text)).toEqual({ ok: true });
    const continued = create.mock.calls[1][0].messages;
    expect(continued.at(-1)).toEqual(expect.objectContaining({ role: 'user' }));
    expect(continued.at(-2)).toEqual({ role: 'assistant', content: first.content });
    expect(continued.at(-2).content[0]).toEqual({ type: 'thinking', thinking: '', signature: 'signed' });
    expect(create.mock.calls[1][0].messages.some((turn, index, all) =>
      turn.role === 'assistant' && index === all.length - 1
    )).toBe(false);
  });

  test('fails closed when continuations stay truncated', async () => {
    const create = jest.fn().mockResolvedValue(message('{"ok":', 'max_tokens'));
    await expect(callWithContinuation(
      { messages: { create } },
      { max_tokens: 100, messages: [{ role: 'user', content: 'analyze' }] }
    )).rejects.toThrow('truncated after 2 continuation(s)');
    expect(create).toHaveBeenCalledTimes(3);
  });

  test('does not return refusal text from the first response', async () => {
    const create = jest.fn().mockResolvedValue(message('{"ok":true}', 'refusal', {
      stop_details: { category: 'bio' },
    }));
    await expect(callWithContinuation(
      { messages: { create } },
      { max_tokens: 100, messages: [{ role: 'user', content: 'analyze' }] }
    )).rejects.toThrow('Model refused the request (bio)');
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('uses messages.stream when max_tokens exceeds the non-streaming ceiling', async () => {
    const create = jest.fn();
    const stream = jest.fn(() => ({
      finalMessage: () => Promise.resolve(message('{"streamed":true}')),
    }));
    const text = await callWithContinuation(
      { messages: { create, stream } },
      { max_tokens: 64000, messages: [{ role: 'user', content: 'analyze' }] }
    );
    expect(text).toBe('{"streamed":true}');
    expect(create).not.toHaveBeenCalled();
    expect(stream.mock.calls[0][0].max_tokens).toBe(64000);
    expect(stream.mock.calls[0][1]).toEqual({ timeout: 30 * 60 * 1000 });
  });
});
