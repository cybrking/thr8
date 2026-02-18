const fs = require('fs');
const path = require('path');

function findTfFiles(repoPath) {
  const results = [];
  try {
    walkDir(repoPath, results);
  } catch {
    // Directory doesn't exist or not readable
  }
  return results;
}

function walkDir(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.name.endsWith('.tf')) {
      results.push(fullPath);
    }
  }
}

function extractResources(content) {
  const resources = [];
  const resourceStart = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let match;

  while ((match = resourceStart.exec(content)) !== null) {
    const type = match[1];
    const name = match[2];
    const bodyStart = match.index + match[0].length;

    // Find matching closing brace by counting brace depth
    let depth = 1;
    let i = bodyStart;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    const body = content.slice(bodyStart, i - 1);
    resources.push({ type, name, body });
  }

  return resources;
}

function detectProvider(content) {
  if (/provider\s+"aws"/.test(content) || /resource\s+"aws_/.test(content)) {
    return 'AWS';
  }
  if (/provider\s+"google"/.test(content) || /resource\s+"google_/.test(content)) {
    return 'GCP';
  }
  if (/provider\s+"azurerm"/.test(content) || /resource\s+"azurerm_/.test(content)) {
    return 'Azure';
  }
  return null;
}

function extractCompute(resources) {
  const compute = [];

  for (const r of resources) {
    if (r.type === 'aws_ecs_service') {
      const launchType = extractValue(r.body, 'launch_type');
      const desiredCount = extractValue(r.body, 'desired_count');
      const isFargate = launchType && launchType.toUpperCase() === 'FARGATE';
      compute.push({
        type: isFargate ? 'ECS Fargate' : 'ECS EC2',
        name: extractValue(r.body, 'name') || r.name,
        desired_count: desiredCount ? parseInt(desiredCount, 10) : 1,
      });
    } else if (r.type === 'aws_instance') {
      compute.push({
        type: 'EC2',
        name: r.name,
        instance_type: extractValue(r.body, 'instance_type'),
      });
    } else if (r.type === 'aws_lambda_function') {
      compute.push({
        type: 'Lambda',
        name: extractValue(r.body, 'function_name') || r.name,
        runtime: extractValue(r.body, 'runtime'),
      });
    }
  }

  return compute;
}

function extractNetworking(resources) {
  const networking = {
    vpc_cidr: null,
    subnets: [],
    security_groups: [],
  };

  for (const r of resources) {
    if (r.type === 'aws_vpc') {
      networking.vpc_cidr = extractValue(r.body, 'cidr_block');
    } else if (r.type === 'aws_subnet') {
      networking.subnets.push({
        name: extractTagName(r.body) || r.name,
        cidr_block: extractValue(r.body, 'cidr_block'),
        availability_zone: extractValue(r.body, 'availability_zone'),
      });
    } else if (r.type === 'aws_security_group') {
      networking.security_groups.push({
        name: extractValue(r.body, 'name') || r.name,
      });
    }
  }

  return networking;
}

function extractDataStores(resources) {
  const stores = [];

  for (const r of resources) {
    if (r.type === 'aws_db_instance') {
      const engine = extractValue(r.body, 'engine') || '';
      const engineMap = { postgres: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', aurora: 'Aurora' };
      const engineLabel = engineMap[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
      stores.push({
        type: 'RDS ' + engineLabel,
        engine_version: extractValue(r.body, 'engine_version'),
        instance_class: extractValue(r.body, 'instance_class'),
        encryption_at_rest: extractBool(r.body, 'storage_encrypted'),
        multi_az: extractBool(r.body, 'multi_az'),
        public: extractBool(r.body, 'publicly_accessible'),
      });
    } else if (r.type === 'aws_s3_bucket') {
      stores.push({
        type: 'S3',
        name: extractValue(r.body, 'bucket') || r.name,
      });
    } else if (r.type === 'aws_dynamodb_table') {
      stores.push({
        type: 'DynamoDB',
        name: extractValue(r.body, 'name') || r.name,
      });
    }
  }

  return stores;
}

function extractSecrets(resources) {
  for (const r of resources) {
    if (r.type === 'aws_secretsmanager_secret') {
      return { type: 'AWS Secrets Manager', name: extractValue(r.body, 'name') || r.name };
    }
    if (r.type === 'aws_ssm_parameter') {
      return { type: 'AWS SSM Parameter Store', name: extractValue(r.body, 'name') || r.name };
    }
  }
  return null;
}

function extractMonitoring(resources) {
  const monitoring = [];

  for (const r of resources) {
    if (r.type === 'aws_cloudwatch_log_group') {
      if (!monitoring.includes('CloudWatch Logs')) {
        monitoring.push('CloudWatch Logs');
      }
    } else if (r.type === 'aws_cloudwatch_metric_alarm') {
      if (!monitoring.includes('CloudWatch Alarms')) {
        monitoring.push('CloudWatch Alarms');
      }
    }
  }

  return monitoring;
}

// Helpers

function extractValue(body, key) {
  // Match key = "value" or key = number
  const strRegex = new RegExp('(?:^|\\n)\\s*' + key + '\\s*=\\s*"([^"]*)"', 'm');
  const strMatch = body.match(strRegex);
  if (strMatch) return strMatch[1];

  // Match unquoted numeric values
  const numRegex = new RegExp('(?:^|\\n)\\s*' + key + '\\s*=\\s*(\\d+)', 'm');
  const numMatch = body.match(numRegex);
  if (numMatch) return numMatch[1];

  return null;
}

function extractBool(body, key) {
  const regex = new RegExp('(?:^|\\n)\\s*' + key + '\\s*=\\s*(true|false)', 'm');
  const match = body.match(regex);
  return match ? match[1] === 'true' : false;
}

function extractTagName(body) {
  // Try tags = { Name = "value" }
  const match = body.match(/tags\s*=\s*\{[^}]*Name\s*=\s*"([^"]*)"/);
  return match ? match[1] : null;
}

module.exports = {
  findTfFiles,
  extractResources,
  detectProvider,
  extractCompute,
  extractNetworking,
  extractDataStores,
  extractSecrets,
  extractMonitoring,
};
