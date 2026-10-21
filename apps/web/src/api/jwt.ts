export interface SessionUser {
  id: string;
  roles: string[];
  permissions: string[];
}

export function decodeJwt(token: string): SessionUser | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const json = decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const p = JSON.parse(json) as { sub?: string; roles?: unknown; permissions?: unknown };
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    return { id: String(p.sub ?? ''), roles: list(p.roles), permissions: list(p.permissions) };
  } catch {
    return null;
  }
}
