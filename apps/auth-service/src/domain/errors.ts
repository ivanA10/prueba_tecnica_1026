/** Error no recuperable al procesar un evento: va directo a la DLQ. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

export type CredentialStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';

export interface CredentialRecord {
  userId: string;
  email: string;
  passwordHash: string;
  status: CredentialStatus;
}

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}
