import { ALL_PERMISSIONS, PERMISSIONS, PERMISSION_LABELS, hasPermission, isKnownPermission } from './index';

describe('permissions', () => {
  it('hasPermission honors exact match and wildcard', () => {
    expect(hasPermission(['users:read'], PERMISSIONS.USERS_READ)).toBe(true);
    expect(hasPermission(['*'], PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission(['users:read'], PERMISSIONS.USERS_WRITE)).toBe(false);
    expect(hasPermission(undefined, PERMISSIONS.USERS_READ)).toBe(false);
  });

  it('catalog is consistent', () => {
    expect(isKnownPermission('roles:write')).toBe(true);
    expect(isKnownPermission('nope')).toBe(false);
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
