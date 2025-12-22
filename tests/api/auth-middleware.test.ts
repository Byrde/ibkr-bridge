import { createAuthMiddleware } from '../../src/api/auth-middleware';

describe('createAuthMiddleware', () => {
  const config = { username: 'admin', password: 'secret' };
  const middleware = createAuthMiddleware(config);

  function createMockRequest(authHeader?: string) {
    return {
      headers: {
        authorization: authHeader,
      },
    } as any;
  }

  function createMockReply() {
    const reply = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      header(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      send(body: any) {
        this.body = body;
        return this;
      },
    };
    return reply;
  }

  it('should reject requests without authorization header', async () => {
    const request = createMockRequest();
    const reply = createMockReply();

    await middleware(request, reply as any);

    expect(reply.statusCode).toBe(401);
    expect(reply.headers['WWW-Authenticate']).toBe('Basic realm="IBKR REST Bridge"');
  });

  it('should reject requests with invalid auth type', async () => {
    const request = createMockRequest('Bearer token123');
    const reply = createMockReply();

    await middleware(request, reply as any);

    expect(reply.statusCode).toBe(401);
  });

  it('should reject requests with invalid credentials', async () => {
    const credentials = Buffer.from('wrong:credentials').toString('base64');
    const request = createMockRequest(`Basic ${credentials}`);
    const reply = createMockReply();

    await middleware(request, reply as any);

    expect(reply.statusCode).toBe(401);
  });

  it('should allow requests with valid credentials', async () => {
    const credentials = Buffer.from('admin:secret').toString('base64');
    const request = createMockRequest(`Basic ${credentials}`);
    const reply = createMockReply();

    await middleware(request, reply as any);

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toBeNull();
  });
});












