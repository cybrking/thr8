const fs = require('fs');
const terraform = require('../parsers/terraform');
const docker = require('../parsers/dockerfile');

class InfrastructureAgent {
  constructor() {}

  async analyze(repoPath) {
    const [tfResult, dockerServices] = await Promise.all([
      Promise.resolve(this._analyzeTerraform(repoPath)),
      Promise.resolve(docker.analyzeDockerCompose(repoPath)),
    ]);

    return {
      provider: tfResult.provider,
      compute: tfResult.compute,
      networking: tfResult.networking,
      data_stores: tfResult.data_stores,
      secrets: tfResult.secrets,
      monitoring: tfResult.monitoring,
      docker_services: dockerServices,
    };
  }

  _analyzeTerraform(repoPath) {
    const tfFiles = terraform.findTfFiles(repoPath);
    if (tfFiles.length === 0) {
      return {
        provider: null,
        compute: [],
        networking: { vpc_cidr: null, subnets: [], security_groups: [] },
        data_stores: [],
        secrets: null,
        monitoring: [],
      };
    }

    let allContent = '';
    let allResources = [];

    for (const filePath of tfFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      allContent += content + '\n';
      allResources = allResources.concat(terraform.extractResources(content));
    }

    return {
      provider: terraform.detectProvider(allContent),
      compute: terraform.extractCompute(allResources),
      networking: terraform.extractNetworking(allResources),
      data_stores: terraform.extractDataStores(allResources),
      secrets: terraform.extractSecrets(allResources),
      monitoring: terraform.extractMonitoring(allResources),
    };
  }
}

module.exports = InfrastructureAgent;
