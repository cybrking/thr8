/**
 * Read Claude Messages API results.
 *
 * Text is taken from every block with type "text". Thinking blocks are not
 * treated as the assessment. Refusals, context-window stops, truncation, and
 * JSON that does not parse are errors. Truncated JSON is not repaired into a
 * threat model or a code fix.
 */

const { NONSTREAMING_MAX_TOKENS } = require('../security/claude-model');

function extractJsonText(text) {
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return text.trim();
}

function parseJsonResponse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Unreadable model JSON: empty text');
  }
  const jsonText = extractJsonText(text);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Unreadable model JSON: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function refusalCategory(response) {
  const details = response && response.stop_details;
  if (!details || typeof details !== 'object') return null;
  return typeof details.category === 'string' && details.category ? details.category : null;
}

function textFromContent(content) {
  if (!Array.isArray(content)) {
    throw new Error('Model response did not include content blocks');
  }
  let text = '';
  for (const block of content) {
    if (!block || block.type !== 'text') continue;
    if (typeof block.text !== 'string') throw new Error('Model text block was not a string');
    text += block.text;
  }
  return text;
}

function assertUsableResponse(response) {
  if (!response || typeof response !== 'object') throw new Error('Model response was empty');
  const reason = response.stop_reason;
  if (reason === 'refusal') {
    const category = refusalCategory(response);
    throw new Error(`Model refused the request${category ? ` (${category})` : ''}`);
  }
  if (reason === 'model_context_window_exceeded') {
    throw new Error('Model stopped because the context window was exceeded');
  }
  if (reason === 'max_tokens') {
    throw new Error('Model output truncated before completion');
  }
  if (reason !== 'end_turn') {
    throw new Error(`Model stopped with unusable reason: ${reason || 'unknown'}`);
  }
}

function readCompleteText(response) {
  assertUsableResponse(response);
  const text = textFromContent(response.content);
  if (!text.trim()) throw new Error('Model completed without text output');
  return text;
}

async function createMessage(client, params) {
  if (!client || !client.messages) throw new Error('Anthropic client is missing messages');
  if (params.max_tokens > NONSTREAMING_MAX_TOKENS) {
    if (typeof client.messages.stream !== 'function') {
      throw new Error('Streaming is required for this max_tokens budget but messages.stream is unavailable');
    }
    const stream = client.messages.stream(params);
    if (!stream || typeof stream.finalMessage !== 'function') {
      throw new Error('Anthropic stream did not provide finalMessage');
    }
    return stream.finalMessage();
  }
  return client.messages.create(params);
}

async function callWithRetry(client, params, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await createMessage(client, params);
    } catch (error) {
      const status = error.status || error.statusCode;
      const isRetryable = status === 429 || status === 529 || status === 503;
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`API call failed (${status || 'network'}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

async function callWithContinuation(client, params, maxContinuations = 2) {
  let fullText = '';
  let messages = params.messages;

  for (let i = 0; i <= maxContinuations; i++) {
    const response = await callWithRetry(client, { ...params, messages });
    if (response && response.stop_reason === 'max_tokens') {
      fullText += textFromContent(response.content);
      if (i === maxContinuations) {
        throw new Error(`Model output truncated after ${maxContinuations} continuation(s)`);
      }
      // Keep the prior assistant blocks, including thinking signatures, and
      // end the conversation with a user turn. These models reject a prefilled
      // final assistant message.
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: 'The previous JSON text was cut off. Continue exactly where that text left off. Do not repeat earlier JSON and do not add commentary.',
        },
      ];
      continue;
    }
    assertUsableResponse(response);
    fullText += textFromContent(response.content);
    if (!fullText.trim()) throw new Error('Model completed without text output');
    return fullText;
  }

  throw new Error(`Model output truncated after ${maxContinuations} continuation(s)`);
}

module.exports = {
  extractJsonText,
  parseJsonResponse,
  textFromContent,
  readCompleteText,
  createMessage,
  callWithRetry,
  callWithContinuation,
};
