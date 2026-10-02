const { isAllowedRemediationPath, validateRemediationFiles } = require('../../src/security/remediation-scope');

describe('remediation path policy', () => {
  test.each([
    '.github/workflows/ci.yml', '.GitHub/workflows/ci.yml', '.git/config',
    '.gitlab-ci.yml', '.circleci/config.yml', '.husky/pre-commit', '.aws/credentials',
    '.ssh/id_rsa', '.npmrc', '.env', '.env.production', 'config/.env.local',
    'CODEOWNERS', 'docs/CODEOWNERS', 'action.yaml', 'actions/custom/action.yml',
    'Jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yaml', 'circle.yml',
    'credentials.json', 'config/secrets.yaml', 'id_ed25519', 'certs/server.key',
    'certs/client.pem', 'terraform.tfstate', 'terraform.tfstate.backup',
  ])('requires a manual fix for protected target %s even if selected', filePath => {
    expect(isAllowedRemediationPath(filePath)).toBe(false);
    expect(() => validateRemediationFiles({ files: [{ path: filePath, fixed_content: 'new' }] }, [filePath]))
      .toThrow(/scope/);
  });

  test.each([
    'src/auth.js', 'src/security/credentials.js', 'tests/auth.test.js', 'routes/users.py',
    'infra/main.tf', 'k8s/deployment.yaml', 'Dockerfile', 'docker-compose.yml',
    'package.json', 'requirements.txt', '.env.example', 'config/.env.sample',
    '.eslintrc.json', '.eslintrc.js', 'src/query handler.js',
  ])('preserves selected application and infrastructure target %s', filePath => {
    expect(isAllowedRemediationPath(filePath)).toBe(true);
    expect(validateRemediationFiles({ files: [{ path: filePath, fixed_content: '' }] }, [filePath]))
      .toEqual([{ path: filePath, fixed_content: '' }]);
  });

  test('model-supplied authorization cannot expand the caller scope', () => {
    const plan = {
      allowedPaths: ['src/unrelated.js'],
      selectedFiles: [{ path: 'src/unrelated.js' }],
      files: [{ path: 'src/unrelated.js', fixed_content: 'new' }],
    };
    expect(() => validateRemediationFiles(plan, ['src/auth.js'])).toThrow(/scope/);
  });
});
