const { validateModel } = require('../../src/security/validate-model');
const vulnerability = () => ({
  id: 'directory-exposure', title: 'Directory exposure', description: 'Guests see all users', severity: 'High',
  basis: 'observed', attacker_prerequisites: 'Guest membership', assumptions: ['Deployment unknown'],
  control_scope: 'Workspace scoping only', security_requirement: 'Return eligible participants only',
  negative_test: 'Guest autocomplete must omit other employees and email addresses',
  evidence: [{ path: 'route.js', start_line: 2, end_line: 2, quote: 'lookup(workspace)' }],
});
const model = () => ({
  overall_risk_status: 'HIGH', business_objectives: [],
  attack_surfaces: [{ vulnerabilities: [vulnerability()] }],
  attack_scenarios: [{ steps: [{ exploits: ['directory-exposure'] }] }],
  risk_analysis: [{ risk_id: 'R1', pasta_level: 'High', linked_vulnerabilities: ['directory-exposure'] }],
  tactical_recommendations: [{ addresses: ['R1'] }], summary: { total_vulnerabilities: 0 },
});
const options = { requireEvidence: true, files: [{ path: 'route.js', content: '// route\nreturn lookup(workspace);' }] };

test('preserves traceable threat requirements and derives counts from actual findings', () => {
  expect(validateModel(model(), options).summary).toMatchObject({ total_vulnerabilities: 1, high: 1, critical: 0 });
});
test.each([
  v => { v.evidence[0].path = 'invented.js'; },
  v => { v.evidence[0].end_line = 999; },
  v => { v.evidence[0].quote = 'lookup(participants)'; },
  v => { delete v.security_requirement; },
  v => { v.evidence = []; },
])('rejects unsupported or unactionable evidence', mutate => {
  const result = model(); mutate(result.attack_surfaces[0].vulnerabilities[0]);
  expect(() => validateModel(result, options)).toThrow('Invalid threat model');
});
test('rejects dangling IDs and malformed clean responses', () => {
  const result = model(); result.attack_scenarios[0].steps[0].exploits = ['invented'];
  expect(() => validateModel(result)).toThrow('scenario links');
  expect(() => validateModel({ summary: { total_vulnerabilities: 0 } })).toThrow();
});
