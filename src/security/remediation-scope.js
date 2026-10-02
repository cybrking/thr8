// Automatic fixes may edit source/config supplied by the caller, not repository
// automation, access policy, or credential material. These paths need manual fixes.
const SAFE_DOTFILES = new Set(['.env.example', '.env.sample', '.eslintrc.json', '.eslintrc.js']);
const SENSITIVE_NAMES = /^(?:codeowners|jenkinsfile|action\.ya?ml|azure-pipelines\.ya?ml|bitbucket-pipelines\.ya?ml|circle\.ya?ml|(?:credentials?|secrets?)(?:\.(?:json|ya?ml|ini|toml|cfg|conf))?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/i;
const SENSITIVE_EXTENSIONS = /\.(?:pem|key|p12|pfx|jks|keystore|tfstate(?:\.backup)?)$/i;

function isAllowedRemediationPath(filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.trim() !== filePath ||
      /[\\%:\x00-\x1f\x7f]/.test(filePath)) return false;
  const parts = filePath.split('/');
  return parts.every((part, index) => part && part !== '.' && part !== '..' &&
    (!part.startsWith('.') || (index === parts.length - 1 && SAFE_DOTFILES.has(part))) &&
    !SENSITIVE_NAMES.test(part) && !SENSITIVE_EXTENSIONS.test(part));
}

function validateRemediationFiles(fixData, allowedPaths) {
  // Scope must be supplied separately by the caller, never by model output.
  if (!Array.isArray(allowedPaths) || !allowedPaths.length ||
      !allowedPaths.every(isAllowedRemediationPath)) {
    throw new Error('Missing or invalid approved remediation scope');
  }
  if (!fixData || !Array.isArray(fixData.files) || !fixData.files.length) {
    throw new Error('Fix must contain a nonempty files array');
  }
  const allowed = new Set(allowedPaths);
  const seen = new Set();
  return fixData.files.map(file => {
    if (!file || !isAllowedRemediationPath(file.path) || !allowed.has(file.path)) {
      throw new Error('Fix path is outside the approved remediation scope or is sensitive');
    }
    if (seen.has(file.path) || typeof file.fixed_content !== 'string') {
      throw new Error('Fix contains duplicate paths or invalid file content');
    }
    seen.add(file.path);
    // Snapshot the validated fields before any asynchronous GitHub calls.
    return { path: file.path, fixed_content: file.fixed_content };
  });
}

module.exports = { isAllowedRemediationPath, validateRemediationFiles };
