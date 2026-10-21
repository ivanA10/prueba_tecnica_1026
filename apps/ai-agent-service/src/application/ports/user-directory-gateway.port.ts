export interface UserSummary {
  id: string;
  name: string;
  roleId: string;
  status: string;
}

export interface UserLookupQuery {
  query?: string;
  role?: string;
}

export interface CallerContext {
  authorization: string;
  correlationId?: string;
  signal?: AbortSignal;
}

export interface UserDirectoryGateway {
  lookup(q: UserLookupQuery, ctx: CallerContext): Promise<UserSummary[]>;
}

export class UserToolUnavailableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'UserToolUnavailableError';
  }
}
