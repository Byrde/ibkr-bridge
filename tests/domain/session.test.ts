import { IbkrSessionRepository } from '../../src/infrastructure/ibkr-session-repository';

describe('IbkrSessionRepository', () => {
  let repository: IbkrSessionRepository;

  beforeEach(() => {
    repository = new IbkrSessionRepository();
  });

  it('should initialize with disconnected status', () => {
    const session = repository.getSession();
    expect(session.status).toBe('disconnected');
  });

  it('should update session status', () => {
    repository.updateSession({ status: 'authenticating' });
    expect(repository.getSession().status).toBe('authenticating');
  });

  it('should update session with authentication details', () => {
    const now = new Date();
    repository.updateSession({
      status: 'authenticated',
      authenticatedAt: now,
    });

    const session = repository.getSession();
    expect(session.status).toBe('authenticated');
    expect(session.authenticatedAt).toEqual(now);
  });

  it('should clear session', () => {
    repository.updateSession({
      status: 'authenticated',
      authenticatedAt: new Date(),
    });

    repository.clearSession();

    const session = repository.getSession();
    expect(session.status).toBe('disconnected');
    expect(session.authenticatedAt).toBeUndefined();
  });

  it('should return a copy of session to prevent mutation', () => {
    const session1 = repository.getSession();
    session1.status = 'authenticated';

    const session2 = repository.getSession();
    expect(session2.status).toBe('disconnected');
  });
});
