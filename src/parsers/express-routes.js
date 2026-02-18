const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'dist', 'build', 'coverage']);

function findJsFiles(dirPath, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      findJsFiles(fullPath, results);
    } else if (/\.(js|ts)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractRoutes(content, filePath) {
  const routes = [];
  // Find route definitions: router.method('path', ...) or app.method('path', ...)
  const startRegex = /(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`](.*?)['"`]/g;

  let match;
  while ((match = startRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];

    // Extract the full argument list after the path string by tracking parens
    const afterPath = content.slice(match.index + match[0].length);
    const args = extractArgsAfterPath(afterPath);

    // Identify middleware: named identifiers that aren't the handler function
    const middleware = args
      .filter(a => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(a))
      .filter(a => a !== 'async' && a !== 'function');

    routes.push({
      method,
      path: routePath,
      file: filePath,
      middleware,
    });
  }

  return routes;
}

function extractArgsAfterPath(text) {
  // We're positioned right after the path string closing quote
  // We need to collect comma-separated arguments until the matching closing paren
  const args = [];
  let depth = 1; // We're inside the opening paren of the route call
  let i = 0;
  let current = '';

  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) break;
      current += ch;
    } else if (ch === ',' && depth === 1) {
      const trimmed = current.trim();
      if (trimmed) args.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
    i++;
  }

  // The last argument (the handler function) is never pushed to args because
  // the loop breaks when depth reaches 0. So args contains only middleware.
  return args.map(a => a.trim());
}

function parseExpressRoutes(repoPath) {
  const files = findJsFiles(repoPath);
  const allRoutes = [];

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const routes = extractRoutes(content, filePath);
    allRoutes.push(...routes);
  }

  return allRoutes;
}

module.exports = { findJsFiles, extractRoutes, parseExpressRoutes };
