const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { parseJsonResponse, callWithContinuation } = require('../utils/parse-json');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'vendor', '.terraform', '.cache', 'coverage', '.nyc_output',
  'target', 'bin', 'obj', '.gradle', '.idea', '.vscode',
  'venv', '.venv', 'env', '.env', 'bower_components',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
  '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.lock',
  '.min.js', '.min.css', '.map', '.pyc', '.pyo', '.class', '.o',
  '.so', '.dll', '.exe', '.bin', '.dat', '.db', '.sqlite',
]);

// Files to always include if they exist (high signal)
const PRIORITY_FILES = [
  'package.json', 'package-lock.json', 'requirements.txt', 'Pipfile',
  'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', '.env.sample', 'action.yml', 'action.yaml',
  'tsconfig.json', 'next.config.js', 'next.config.ts',
  'nuxt.config.js', 'nuxt.config.ts', 'vite.config.js', 'vite.config.ts',
  'webpack.config.js', '.eslintrc.json', '.eslintrc.js',
];

const SOURCE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.java', '.rb', '.rs',
  '.cs', '.php', '.swift', '.kt', '.scala', '.vue', '.svelte',
  '.tf', '.hcl', '.yml', '.yaml', '.json', '.toml', '.cfg', '.ini',
  '.sh', '.bash', '.sql', '.graphql', '.gql', '.proto',
  '.html', '.css', '.scss', '.env.example',
]);

const MAX_FILE_SIZE = 8000;    // chars per file
const MAX_TOTAL_SIZE = 120000; // total chars for all files

class CodebaseScannerAgent {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  _collectFiles(repoPath) {
    const files = [];
    const priorityFiles = [];

    const walk = (dir, depth = 0) => {
      if (depth > 8) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && !PRIORITY_FILES.includes(entry.name)) {
          if (entry.isDirectory()) continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(repoPath, fullPath);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          walk(fullPath, depth + 1);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;

        // Check if it's a priority file
        if (PRIORITY_FILES.includes(entry.name)) {
          priorityFiles.push({ path: relPath, fullPath });
          continue;
        }

        // Check if it's a source file we care about
        if (SOURCE_EXTENSIONS.has(ext)) {
          files.push({ path: relPath, fullPath });
        }
      }
    };

    walk(repoPath);

    // Sort source files: config/infra first, then routes/api, then others
    files.sort((a, b) => {
      const score = (p) => {
        if (/route|controller|handler|endpoint|api/i.test(p)) return 0;
        if (/auth|security|middleware|guard/i.test(p)) return 1;
        if (/config|setting/i.test(p)) return 2;
        if (/\.tf$|docker|k8s|helm|deploy/i.test(p)) return 3;
        if (/model|schema|migration|database/i.test(p)) return 4;
        if (/service|util|helper|lib/i.test(p)) return 5;
        return 6;
      };
      return score(a.path) - score(b.path);
    });

    return [...priorityFiles, ...files];
  }

  _readFiles(fileList) {
    const results = [];
    let totalSize = 0;

    for (const file of fileList) {
      if (totalSize >= MAX_TOTAL_SIZE) break;

      try {
        let content = fs.readFileSync(file.fullPath, 'utf8');

        // Skip files that look binary
        if (/[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 100))) continue;

        // Truncate large files
        if (content.length > MAX_FILE_SIZE) {
          content = content.slice(0, MAX_FILE_SIZE) + '\n... [truncated]';
        }

        // Skip package-lock.json content (just note it exists)
        if (file.path === 'package-lock.json') {
          content = '(lock file exists - dependencies are pinned)';
        }

        totalSize += content.length;
        results.push({ path: file.path, content });
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  async analyze(repoPath) {
    const fileList = this._collectFiles(repoPath);
    const files = this._readFiles(fileList);

    const filesSummary = files.map(f =>
      `--- ${f.path} ---\n${f.content}`
    ).join('\n\n');

    const systemPrompt = `You are a senior security architect performing codebase analysis for a PASTA threat model. You are given the actual source files from a repository. Analyze them thoroughly to produce a complete system inventory and data flow map.

IMPORTANT: Base your analysis on ACTUAL code you see, not assumptions. Be concise (1-2 sentences per description).

Output ONLY valid JSON matching this schema:
{
  "system_context": {
    "project_name": "Detected project name",
    "description": "Brief description of what this system does",
    "tech_stack": {
      "languages": ["Language 1"],
      "frameworks": ["Framework 1"],
      "databases": ["DB 1 if any"],
      "external_services": ["Service 1 if any"],
      "auth_mechanisms": ["Auth method if any"],
      "security_controls": ["Control 1 if any"]
    },
    "infrastructure": {
      "provider": "AWS|GCP|Azure|None detected",
      "containerized": true,
      "services": ["Infra component 1"]
    },
    "api_surface": {
      "endpoints": [
        {
          "method": "GET|POST|PUT|DELETE",
          "path": "/api/path",
          "auth_required": true,
          "description": "Brief description",
          "sensitive_data": ["field1"]
        }
      ]
    },
    "sensitive_patterns": [
      {
        "file": "path/to/file",
        "finding": "Brief description of security-relevant pattern found",
        "severity": "Critical|High|Medium|Low"
      }
    ]
  },
  "data_flows": {
    "flows": [
      {
        "id": "snake_case_flow_name",
        "name": "Human Readable Flow Name",
        "steps": [
          {
            "component": "Component Name",
            "type": "external_user|load_balancer|application|database|external_service",
            "data": ["field1", "field2"],
            "protocol": "HTTPS|TLS|etc",
            "process": "brief description",
            "operation": "DB operation if applicable"
          }
        ],
        "data_classification": "PII|PCI|PHI|Public|Internal",
        "trust_boundaries": [
          {
            "from": "Zone A",
            "to": "Zone B",
            "control": "Security control",
            "authentication": "Auth mechanism or None"
          }
        ]
      }
    ]
  }
}

For system_context: Identify all technologies, frameworks, databases, APIs, auth methods, and infrastructure FROM THE ACTUAL CODE. Look at imports, dependencies, config files, route definitions, middleware, database connections, environment variables, and deployment configs.

For sensitive_patterns: Flag hardcoded secrets, insecure configurations, missing auth on sensitive endpoints, SQL injection risks, XSS vectors, etc. that you observe in the actual code.

For data_flows: Trace how data moves through the system based on the actual code paths you see — user input through validation, processing, storage, and external service calls.`;

    try {
      const params = {
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Analyze this codebase (${files.length} files collected from repository):

${filesSummary}`
        }],
      };

      const text = await callWithContinuation(this.client, params);
      const result = parseJsonResponse(text);

      return {
        systemContext: result.system_context || {},
        dataFlows: result.data_flows || { flows: [] },
        filesScanned: files.length,
      };
    } catch (error) {
      console.error('Codebase scan failed:', error.message);
      return {
        systemContext: {},
        dataFlows: { flows: [] },
        filesScanned: files.length,
      };
    }
  }
}

module.exports = CodebaseScannerAgent;
