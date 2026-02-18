const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function analyzeDockerCompose(repoPath) {
  const composePath = path.join(repoPath, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) {
    const altPath = path.join(repoPath, 'docker-compose.yaml');
    if (!fs.existsSync(altPath)) {
      return [];
    }
    return parseComposeFile(altPath);
  }
  return parseComposeFile(composePath);
}

function parseComposeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(content);
    if (!doc || !doc.services) return [];

    const services = [];
    for (const [name, config] of Object.entries(doc.services)) {
      services.push({
        name,
        image: config.image || null,
        build: config.build ? true : false,
        ports: config.ports || [],
        depends_on: config.depends_on || [],
      });
    }
    return services;
  } catch {
    return [];
  }
}

module.exports = {
  analyzeDockerCompose,
};
