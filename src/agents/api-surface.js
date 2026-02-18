const { parseExpressRoutes } = require('../parsers/express-routes');

const AUTH_MIDDLEWARE = ['auth', 'authenticate', 'passport', 'requireAuth', 'ensureAuthenticated'];

class APISurfaceAgent {
  constructor() {}

  async analyze(repoPath, techStack) {
    const frameworkName = techStack?.framework?.name || '';
    const supported = ['Express', 'Fastify'];

    if (!supported.some(f => frameworkName.includes(f))) {
      return { endpoints: [] };
    }

    const routes = parseExpressRoutes(repoPath);

    const endpoints = routes.map(route => {
      const hasAuth = route.middleware.some(m =>
        AUTH_MIDDLEWARE.some(a => m.toLowerCase().includes(a.toLowerCase()))
      );

      return {
        method: route.method,
        path: route.path,
        handler: route.file,
        middleware: route.middleware,
        authentication: hasAuth,
      };
    });

    return { endpoints };
  }
}

module.exports = APISurfaceAgent;
