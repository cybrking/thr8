const fs = require('fs');
const path = require('path');

const FRAMEWORK_MAP = {
  'express': 'Express',
  'koa': 'Koa',
  'fastify': 'Fastify',
  'next': 'Next.js',
  'hapi': 'Hapi',
};

const DATABASE_MAP = {
  'pg': 'PostgreSQL',
  'mysql2': 'MySQL',
  'mongoose': 'MongoDB',
  'mongodb': 'MongoDB',
  'ioredis': 'Redis',
  'redis': 'Redis',
};

const AUTH_MAP = {
  'jsonwebtoken': 'JWT',
  'passport-google-oauth20': 'OAuth2',
  'passport-github2': 'OAuth2',
  'express-session': 'Session',
  'passport': 'Passport',
  'passport-local': 'Local Auth',
};

const EXTERNAL_SERVICE_MAP = {
  'stripe': 'Stripe',
  '@aws-sdk/client-s3': 'AWS S3',
  '@sendgrid/mail': 'SendGrid',
  'twilio': 'Twilio',
  '@aws-sdk/client-ses': 'AWS SES',
  '@aws-sdk/client-sqs': 'AWS SQS',
};

const SECURITY_MAP = {
  'helmet': { purpose: 'HTTP headers' },
  'bcrypt': { purpose: 'Password hashing' },
  'express-rate-limit': { purpose: 'Rate limiting' },
  'cors': { purpose: 'CORS configuration' },
  'express-validator': { purpose: 'Input validation' },
  'joi': { purpose: 'Input validation' },
  'zod': { purpose: 'Input validation' },
};

function parse(repoPath) {
  const pkgPath = path.join(repoPath, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    return null;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  const result = {
    runtime: { name: 'Node.js', version: null },
    framework: null,
    databases: [],
    authentication: [],
    external_services: [],
    security_libraries: [],
  };

  // Detect engine version if specified
  if (pkg.engines && pkg.engines.node) {
    result.runtime.version = pkg.engines.node;
  }

  for (const [dep, version] of Object.entries(allDeps)) {
    // Framework
    if (FRAMEWORK_MAP[dep] && !result.framework) {
      result.framework = { name: FRAMEWORK_MAP[dep], version };
    }

    // Database
    if (DATABASE_MAP[dep]) {
      result.databases.push({
        type: DATABASE_MAP[dep],
        client: `${dep}@${version}`,
      });
    }

    // Authentication
    if (AUTH_MAP[dep]) {
      result.authentication.push({
        type: AUTH_MAP[dep],
        library: `${dep}@${version}`,
      });
    }

    // External services
    if (EXTERNAL_SERVICE_MAP[dep]) {
      result.external_services.push({
        name: EXTERNAL_SERVICE_MAP[dep],
        sdk: `${dep}@${version}`,
      });
    }

    // Security
    if (SECURITY_MAP[dep]) {
      result.security_libraries.push({
        name: dep,
        purpose: SECURITY_MAP[dep].purpose,
      });
    }
  }

  return result;
}

module.exports = { parse };
