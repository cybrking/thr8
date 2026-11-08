/**
 * Offline comparison of the historical Sonnet 4.6 request with the supported
 * Sonnet 5.5 and Opus 5.5 requests, plus source facts from a fixture.
 *
 * This harness does not call the Anthropic API and does not invent quality,
 * latency, or cost scores.
 */

const fs = require('fs');
const path = require('path');
const {
  HISTORICAL_SONNET_46,
  messageParams,
  resolveClaudeModel,
  usesStreaming,
} = require('../src/security/claude-model');

const SUPPORTED_IDS = ['claude-sonnet-5-5', 'claude-opus-5-5'];

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

function readObservableFacts(repoPath) {
  const users = fs.readFileSync(path.join(repoPath, 'routes/users.js'), 'utf8');
  const payments = fs.readFileSync(path.join(repoPath, 'routes/payments.js'), 'utf8');
  const app = fs.readFileSync(path.join(repoPath, 'app.js'), 'utf8');
  const compose = fs.readFileSync(path.join(repoPath, 'docker-compose.yml'), 'utf8');
  const terraform = fs.readFileSync(path.join(repoPath, 'terraform/main.tf'), 'utf8');
  const userPost = sliceBetween(users, 'router.post(', 'router.get(');
  const paymentPost = sliceBetween(payments, 'router.post(', 'router.get(');
  const sourceFiles = ['app.js', 'routes/users.js', 'routes/payments.js', 'docker-compose.yml', 'package.json', 'terraform/main.tf'];
  const sqlHits = sourceFiles.filter(file => /\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(fs.readFileSync(path.join(repoPath, file), 'utf8')));

  return [
    {
      id: 'users-post-omits-auth-middleware',
      file: 'routes/users.js',
      quote: userPost.trim(),
      holds: userPost.includes("router.post('/',") && !userPost.includes('auth'),
    },
    {
      id: 'payments-post-uses-auth-and-limiter',
      file: 'routes/payments.js',
      quote: paymentPost.trim(),
      holds: paymentPost.includes('auth') && paymentPost.includes('paymentLimiter'),
    },
    {
      id: 'auth-middleware-file-absent',
      file: 'middleware/auth.js',
      quote: "require('../middleware/auth')",
      holds: users.includes("require('../middleware/auth')") && !fs.existsSync(path.join(repoPath, 'middleware/auth.js')),
    },
    {
      id: 'compose-database-url-contains-password',
      file: 'docker-compose.yml',
      quote: 'postgresql://user:pass@db:5432/app',
      holds: compose.includes('postgresql://user:pass@db:5432/app'),
    },
    {
      id: 'terraform-open-https-and-private-database',
      file: 'terraform/main.tf',
      quote: 'cidr_blocks = ["0.0.0.0/0"]',
      holds: terraform.includes('cidr_blocks = ["0.0.0.0/0"]') && terraform.includes('publicly_accessible  = false'),
    },
    {
      id: 'app-mounts-users-and-payments-behind-helmet',
      file: 'app.js',
      quote: "app.use('/api/users', userRoutes)",
      holds: app.includes('helmet()') && app.includes("app.use('/api/users', userRoutes)") && app.includes("app.use('/api/payments', paymentRoutes)"),
    },
    {
      id: 'fixture-source-has-no-sql-statements',
      file: sourceFiles.join(', '),
      quote: '',
      holds: sqlHits.length === 0,
      sqlHits,
    },
  ];
}

function requestShape(profile, role) {
  const params = messageParams(profile, role);
  return {
    ...params,
    transport: usesStreaming(params.max_tokens) ? 'messages.stream' : 'messages.create',
    samplingParameters: false,
    fallbacks: false,
  };
}

function compareModels(repoPath) {
  const proposed = SUPPORTED_IDS.map(id => {
    const profile = resolveClaudeModel(id);
    return {
      id,
      analysis: requestShape(profile, 'analysis'),
      remediation: requestShape(profile, 'remediation'),
    };
  });
  return {
    liveEvaluation: false,
    limitations: [
      'No Anthropic API call was made. No production credential was used.',
      'Latency, output-token cost, refusal rate, false positives, and missed findings were not measured.',
      'claude-sonnet-5-5 is the proposed default because it is the documented fast general-purpose model in this pair, not because a live security eval selected it.',
      'Historical claude-sonnet-4-6 is shown only as the previous hardcoded request. It is rejected if passed as the model input.',
      'Opus max_tokens 64000 is the published starting ceiling for requests that must leave room to think. It is not a measured medium-effort budget.',
      'Observable facts below are properties of the fixture source. They are not model findings.',
    ],
    historical: {
      ...HISTORICAL_SONNET_46,
      analysis: {
        model: HISTORICAL_SONNET_46.id,
        max_tokens: HISTORICAL_SONNET_46.maxTokens.analysis,
        thinking: null,
        output_config: null,
        transport: 'messages.create',
      },
      remediation: {
        model: HISTORICAL_SONNET_46.id,
        max_tokens: HISTORICAL_SONNET_46.maxTokens.remediation,
        thinking: null,
        output_config: null,
        transport: 'messages.create',
      },
    },
    proposed,
    promptDifference: 'Supported models share the discovery, generation, and remediation prompts. Only model, max_tokens, thinking, and output_config.effort change.',
    observableFacts: readObservableFacts(repoPath),
  };
}

module.exports = { compareModels, readObservableFacts };
