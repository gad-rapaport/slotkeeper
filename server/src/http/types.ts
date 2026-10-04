import type { Role } from '../domain/permissions.js';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthContext {
  user: SessionUser;
  csrfToken: string;
  sessionHash: Buffer;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
