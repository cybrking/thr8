const packageJsonParser = require('../parsers/package-json');
const requirementsTxtParser = require('../parsers/requirements-txt');

class TechStackAgent {
  constructor() {
    this.parsers = [packageJsonParser, requirementsTxtParser];
  }

  async analyze(repoPath) {
    const emptyResult = {
      runtime: null,
      framework: null,
      databases: [],
      authentication: [],
      external_services: [],
      security_libraries: [],
    };

    let merged = { ...emptyResult };

    for (const parser of this.parsers) {
      const result = parser.parse(repoPath);
      if (!result) continue;

      // First parser to detect runtime/framework wins
      if (!merged.runtime) {
        merged.runtime = result.runtime;
      }
      if (!merged.framework && result.framework) {
        merged.framework = result.framework;
      }

      // Merge arrays
      merged.databases = merged.databases.concat(result.databases);
      merged.authentication = merged.authentication.concat(result.authentication);
      merged.external_services = merged.external_services.concat(result.external_services);
      merged.security_libraries = merged.security_libraries.concat(result.security_libraries);
    }

    return merged;
  }
}

module.exports = TechStackAgent;
