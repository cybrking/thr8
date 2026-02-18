const fs = require('fs');
const path = require('path');

const FRAMEWORK_MAP = {
  'django': 'Django',
  'flask': 'Flask',
  'fastapi': 'FastAPI',
  'tornado': 'Tornado',
  'pyramid': 'Pyramid',
};

const DATABASE_MAP = {
  'psycopg2': 'PostgreSQL',
  'psycopg2-binary': 'PostgreSQL',
  'pymongo': 'MongoDB',
  'mysqlclient': 'MySQL',
  'redis': 'Redis',
  'sqlalchemy': 'SQL (ORM)',
};

const AUTH_MAP = {
  'pyjwt': 'JWT',
  'authlib': 'OAuth2',
  'python-jose': 'JWT',
  'django-allauth': 'OAuth2',
  'django-oauth-toolkit': 'OAuth2',
};

const EXTERNAL_SERVICE_MAP = {
  'stripe': 'Stripe',
  'boto3': 'AWS',
  'sendgrid': 'SendGrid',
  'twilio': 'Twilio',
};

const SECURITY_MAP = {
  'bcrypt': { purpose: 'Password hashing' },
  'cryptography': { purpose: 'Cryptographic operations' },
  'django-cors-headers': { purpose: 'CORS configuration' },
  'python-dotenv': { purpose: 'Environment variable management' },
};

function parseLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;

  // Handle various version specifiers: ==, >=, <=, ~=, !=, >, <
  const match = line.match(/^([a-zA-Z0-9_\-\[\].]+)\s*([><=!~]+\s*[\d.]+(?:\s*,\s*[><=!~]+\s*[\d.]+)*)?/);
  if (!match) return null;

  const name = match[1].split('[')[0]; // strip extras like [security]
  const version = match[2] ? match[2].trim() : null;
  return { name: name.toLowerCase(), version };
}

function parse(repoPath) {
  const reqPath = path.join(repoPath, 'requirements.txt');

  if (!fs.existsSync(reqPath)) {
    return null;
  }

  const content = fs.readFileSync(reqPath, 'utf-8');
  const lines = content.split('\n');

  const result = {
    runtime: { name: 'Python', version: null },
    framework: null,
    databases: [],
    authentication: [],
    external_services: [],
    security_libraries: [],
  };

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const { name, version } = parsed;
    const versionStr = version || 'latest';

    // Framework
    if (FRAMEWORK_MAP[name] && !result.framework) {
      result.framework = { name: FRAMEWORK_MAP[name], version: versionStr };
    }

    // Database
    if (DATABASE_MAP[name]) {
      result.databases.push({
        type: DATABASE_MAP[name],
        client: `${name}@${versionStr}`,
      });
    }

    // Authentication
    if (AUTH_MAP[name]) {
      result.authentication.push({
        type: AUTH_MAP[name],
        library: `${name}@${versionStr}`,
      });
    }

    // External services
    if (EXTERNAL_SERVICE_MAP[name]) {
      result.external_services.push({
        name: EXTERNAL_SERVICE_MAP[name],
        sdk: `${name}@${versionStr}`,
      });
    }

    // Security
    if (SECURITY_MAP[name]) {
      result.security_libraries.push({
        name,
        purpose: SECURITY_MAP[name].purpose,
      });
    }
  }

  return result;
}

module.exports = { parse };
