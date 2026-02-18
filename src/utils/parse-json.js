/**
 * Robust JSON parser for Claude API responses.
 * Handles code fences, truncated JSON (from max_tokens), and raw text.
 */

function extractJsonText(text) {
  // Try code fence extraction first
  const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Try finding JSON object directly
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    return text.substring(start, end + 1);
  }
  return text.trim();
}

function repairTruncatedJson(text) {
  // Remove trailing incomplete string/value
  let json = text.replace(/,\s*"[^"]*$/, '');           // trailing incomplete key
  json = json.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');    // trailing incomplete string value
  json = json.replace(/,\s*"[^"]*":\s*\d+[^,\]\}]*$/, ''); // trailing incomplete number
  json = json.replace(/,\s*"[^"]*":\s*$/, '');           // trailing key with no value
  json = json.replace(/,\s*\{[^}]*$/, '');               // trailing incomplete object in array
  json = json.replace(/,\s*$/, '');                      // trailing comma

  // Count open brackets and braces, close them
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of json) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // Close any unclosed structures
  for (let i = 0; i < openBrackets; i++) json += ']';
  for (let i = 0; i < openBraces; i++) json += '}';

  return json;
}

function parseJsonResponse(text) {
  const jsonText = extractJsonText(text);

  // Try parsing as-is first
  try {
    return JSON.parse(jsonText);
  } catch (_) {
    // Fall through to repair
  }

  // Try repairing truncated JSON
  try {
    const repaired = repairTruncatedJson(jsonText);
    return JSON.parse(repaired);
  } catch (_) {
    // Fall through
  }

  // Last resort: try the raw text
  return JSON.parse(text);
}

/**
 * Call Claude with automatic continuation if response is truncated.
 * Concatenates text across multiple calls until we get a complete response.
 */
async function callWithContinuation(client, params, maxContinuations = 2) {
  let fullText = '';

  for (let i = 0; i <= maxContinuations; i++) {
    const messages = i === 0
      ? params.messages
      : [
          ...params.messages,
          { role: 'assistant', content: fullText },
          { role: 'user', content: 'Continue the JSON output exactly where you left off. Do not repeat any content.' }
        ];

    const response = await client.messages.create({
      ...params,
      messages,
    });

    fullText += response.content[0].text;

    // If response completed normally, we're done
    if (response.stop_reason === 'end_turn') {
      break;
    }
    // If we hit max_tokens, continue
    if (response.stop_reason === 'max_tokens') {
      console.log(`Response truncated (iteration ${i + 1}), continuing...`);
      continue;
    }
    break;
  }

  return fullText;
}

module.exports = { parseJsonResponse, callWithContinuation };
