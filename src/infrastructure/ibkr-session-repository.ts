import type { Session, SessionRepository } from '../domain/session';

/**
 * In-memory session state storage.
 */
export class IbkrSessionRepository implements SessionRepository {
  private session: Session = {
    status: 'disconnected',
  };

  getSession(): Session {
    return { ...this.session };
  }

  updateSession(update: Partial<Session>): void {
    this.session = { ...this.session, ...update };
  }

  clearSession(): void {
    this.session = { status: 'disconnected' };
  }
}








