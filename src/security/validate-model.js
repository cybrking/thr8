const LEVELS = ['Critical', 'High', 'Medium', 'Low'];

function validateModel(model, { files = [], requireEvidence = false } = {}) {
  const fail = message => { throw new Error(`Invalid threat model: ${message}`); };
  if (!model || typeof model !== 'object') fail('expected object');
  for (const key of ['business_objectives', 'attack_surfaces', 'attack_scenarios', 'risk_analysis', 'tactical_recommendations']) {
    if (!Array.isArray(model[key])) fail(`${key} must be an array`);
  }
  if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(model.overall_risk_status)) fail('invalid risk status');
  const sources = new Map(files.map(f => [f.path, f.content.split('\n')]));
  const ids = new Set();
  const vulnerabilities = [];
  for (const surface of model.attack_surfaces) {
    if (!surface || !Array.isArray(surface.vulnerabilities)) fail('missing vulnerabilities array');
    for (const v of surface.vulnerabilities) {
      if (!v || typeof v.id !== 'string' || !v.id.trim() || ids.has(v.id)) fail('missing or duplicate vulnerability ID');
      if (!LEVELS.includes(v.severity) || !v.title || !v.description) fail(`invalid vulnerability ${v.id}`);
      ids.add(v.id);
      vulnerabilities.push(v);
      if (requireEvidence) {
        for (const field of ['attacker_prerequisites', 'security_requirement', 'negative_test', 'control_scope']) {
          if (typeof v[field] !== 'string' || !v[field].trim()) fail(`${v.id} missing ${field}`);
        }
        if (!['observed', 'inferred'].includes(v.basis) || !Array.isArray(v.assumptions)) fail(`${v.id} missing basis/assumptions`);
        if (!Array.isArray(v.evidence) || !v.evidence.length) fail(`${v.id} missing code evidence`);
        for (const e of v.evidence) {
          if (!e || typeof e !== 'object') fail(`${v.id} invalid evidence`);
          const lines = sources.get(e.path);
          if (!lines || !Number.isInteger(e.start_line) || !Number.isInteger(e.end_line) ||
              e.start_line < 1 || e.end_line < e.start_line || e.end_line > lines.length ||
              typeof e.quote !== 'string' || !e.quote.trim()) fail(`${v.id} invalid evidence location`);
          const cited = lines.slice(e.start_line - 1, e.end_line).join('\n');
          if (!cited.includes(e.quote) || e.quote.includes('[truncated]')) fail(`${v.id} unsupported evidence quote`);
        }
      }
    }
  }
  const riskIds = new Set();
  for (const risk of model.risk_analysis) {
    if (!risk || !risk.risk_id || riskIds.has(risk.risk_id) || !LEVELS.includes(risk.pasta_level) ||
        !Array.isArray(risk.linked_vulnerabilities) || risk.linked_vulnerabilities.some(id => !ids.has(id))) fail('invalid risk links');
    riskIds.add(risk.risk_id);
  }
  for (const scenario of model.attack_scenarios) {
    if (!scenario || !Array.isArray(scenario.steps)) fail('invalid attack scenario');
    for (const step of scenario.steps) {
      if (!step || !Array.isArray(step.exploits) || step.exploits.some(id => !ids.has(id))) fail('invalid scenario links');
    }
  }
  for (const recommendation of model.tactical_recommendations) {
    if (!recommendation || !Array.isArray(recommendation.addresses) || recommendation.addresses.some(id => !riskIds.has(id))) fail('invalid recommendation links');
  }
  // Counts come from validated findings, never from a model-supplied summary.
  model.summary = {
    total_vulnerabilities: vulnerabilities.length,
    ...Object.fromEntries(LEVELS.map(level => [level.toLowerCase(), vulnerabilities.filter(v => v.severity === level).length])),
    attack_scenarios: model.attack_scenarios.length,
    attack_surfaces: model.attack_surfaces.length,
  };
  const severities = [model.overall_risk_status, ...vulnerabilities.map(v => v.severity.toUpperCase()), ...model.risk_analysis.map(r => r.pasta_level.toUpperCase())];
  model.overall_risk_status = LEVELS.map(l => l.toUpperCase()).find(l => severities.includes(l));
  return model;
}

module.exports = { validateModel };
