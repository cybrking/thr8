const DataFlowAgent = require('../../src/agents/data-flow');

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          flows: [{
            id: 'user_registration',
            name: 'User Registration Flow',
            steps: [
              { component: 'Internet', type: 'external_user', data: ['email', 'password'] },
              { component: 'Express API', type: 'application', process: 'Validate and hash password' },
              { component: 'RDS PostgreSQL', type: 'database', operation: 'INSERT INTO users' }
            ],
            data_classification: 'PII',
            trust_boundaries: [
              { from: 'Internet', to: 'Application', control: 'TLS', authentication: 'None' }
            ]
          }]
        })}]
      })
    }
  }));
});

describe('DataFlowAgent', () => {
  test('calls Claude and returns parsed flows', async () => {
    const agent = new DataFlowAgent('test-key');
    const result = await agent.analyze({
      techStack: { framework: { name: 'Express' }, databases: [{ type: 'PostgreSQL' }] },
      infrastructure: { provider: 'AWS', data_stores: [{ type: 'RDS PostgreSQL' }] },
      apiSurface: { endpoints: [{ method: 'POST', path: '/api/users' }] },
    });
    expect(result.flows).toBeDefined();
    expect(result.flows.length).toBeGreaterThan(0);
    expect(result.flows[0].steps).toBeDefined();
    expect(result.flows[0].trust_boundaries).toBeDefined();
  });

  test('returns empty flows on API error', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: { create: jest.fn().mockRejectedValue(new Error('API error')) }
    }));
    const agent = new DataFlowAgent('test-key');
    const result = await agent.analyze({
      techStack: {}, infrastructure: {}, apiSurface: { endpoints: [] }
    });
    expect(result.flows).toEqual([]);
  });
});
