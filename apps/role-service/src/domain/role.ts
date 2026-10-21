export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  version: number;
}

export class DuplicateRoleError extends Error {
  constructor(name: string) {
    super(`role name already exists: ${name}`);
    this.name = 'DuplicateRoleError';
  }
}

export class VersionConflictError extends Error {
  constructor() {
    super('role version conflict');
    this.name = 'VersionConflictError';
  }
}

export const samePermissions = (a: string[], b: string[]): boolean => {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
