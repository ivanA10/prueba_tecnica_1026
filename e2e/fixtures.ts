import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
export const ADMIN_EMAIL = 'admin@toka.local';
/** Contraseña fija SOLO para usuarios de prueba creados por la suite (nunca la del admin). */
export const USER_PASSWORD = 'E2e-Passw0rd-2026';

/** Roles sembrados por role-service (apps/role-service/src/config/config.ts). */
export const ROLE_IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  operador: '00000000-0000-4000-8000-000000000002',
  auditor: '00000000-0000-4000-8000-000000000003',
} as const;

const ENV_FILE = path.resolve(__dirname, '..', 'infra', 'env', 'user-service.env');
const SEED_KEY = 'ADMIN_SEED_PASSWORD';
const LOGIN_BACKOFF_MS = 13_000;
const MAX_LOGIN_ATTEMPTS = 5;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let cachedAdminPassword: string | undefined;

/**
 * Contraseña del admin: E2E_ADMIN_PASSWORD o ADMIN_SEED_PASSWORD de infra/env/user-service.env.
 * Nunca se imprime ni se escribe en ningún archivo.
 */
export function adminPassword(): string {
  if (cachedAdminPassword) return cachedAdminPassword;
  const fromEnv = process.env.E2E_ADMIN_PASSWORD;
  if (fromEnv) {
    cachedAdminPassword = fromEnv;
    return fromEnv;
  }
  const prefix = `${SEED_KEY}=`;
  const line = readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(prefix));
  const value = line?.slice(prefix.length).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value) throw new Error(`${SEED_KEY} no encontrado en ${ENV_FILE} (o define E2E_ADMIN_PASSWORD)`);
  cachedAdminPassword = value;
  return value;
}

/** Nombre único por ejecución: e2e-<timestamp>-<etiqueta>-<aleatorio>. */
export function uniqName(label: string): string {
  const rnd = Math.random().toString(36).slice(2, 6);
  return `e2e-${Date.now()}-${label}-${rnd}`;
}

/** Login por la UI. Reintenta si nginx responde 429 (login limitado a 5 r/min por IP). Devuelve el accessToken. */
export async function loginUI(page: Page, email: string, password: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Entrar' }).click();
    const res = await response;
    if (res.status() === 429 && attempt < MAX_LOGIN_ATTEMPTS) {
      await sleep(LOGIN_BACKOFF_MS);
      continue;
    }
    if (!res.ok()) throw new Error(`login UI rechazado para ${email} (HTTP ${res.status()})`);
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  }
}

/** Login por API con el mismo límite de reintentos. */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  for (let attempt = 1; ; attempt++) {
    const res = await request.post('/api/auth/login', { data: { email, password } });
    if (res.status() === 429 && attempt < MAX_LOGIN_ATTEMPTS) {
      await sleep(LOGIN_BACKOFF_MS);
      continue;
    }
    if (!res.ok()) throw new Error(`login API rechazado para ${email} (HTTP ${res.status()})`);
    return (await res.json()) as { accessToken: string; expiresIn: number };
  }
}

let adminCache: { token: string; expiresAt: number } | undefined;

/** Token admin para la API; se cachea por proceso para no gastar logins. */
export async function adminToken(request: APIRequestContext): Promise<string> {
  if (adminCache && Date.now() < adminCache.expiresAt) return adminCache.token;
  const { accessToken, expiresIn } = await apiLogin(request, ADMIN_EMAIL, adminPassword());
  adminCache = { token: accessToken, expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000 };
  return accessToken;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: string;
}

export interface ApiRole {
  id: string;
  name: string;
  description?: string | null;
  permissions: string[];
  version?: number;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function expectOk(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) throw new Error(`${what} -> HTTP ${res.status()}`);
}

/** POST /api/users (crea y deja ACTIVE con credenciales sincronizadas). */
export async function createUser(
  request: APIRequestContext,
  token: string,
  input: { name: string; email: string; password: string; roleId: string },
): Promise<ApiUser> {
  const res = await request.post('/api/users', { headers: bearer(token), data: input });
  await expectOk(res, 'POST /api/users');
  return (await res.json()) as ApiUser;
}

/**
 * POST /api/users responds 201 with status ACTIVE, but auth only activates the credentials when it consumes
 * user.created (user-service outbox polls every 1 s, then AMQP). Until then login returns 401.
 * Espera a que el login funcione (401 = aún PENDING en auth; 429 = rate limit de nginx).
 */
export async function waitUntilLoginable(request: APIRequestContext, email: string, password: string): Promise<void> {
  for (let attempt = 1; attempt <= 15; attempt++) {
    const res = await request.post('/api/auth/login', { data: { email, password } });
    if (res.ok()) return;
    if (res.status() === 429) {
      await sleep(LOGIN_BACKOFF_MS);
      continue;
    }
    if (res.status() !== 401) throw new Error(`login API para ${email} -> HTTP ${res.status()}`);
    await sleep(1_000);
  }
  throw new Error(`${email} sigue sin poder iniciar sesión tras 15 intentos`);
}

/** Crea un usuario y espera a que auth lo active, para poder hacer login UI justo después. */
export async function createLoginableUser(
  request: APIRequestContext,
  token: string,
  input: { name: string; email: string; password: string; roleId: string },
): Promise<ApiUser> {
  const user = await createUser(request, token, input);
  await waitUntilLoginable(request, input.email, input.password);
  return user;
}

/** DELETE /api/users/:id (204). */
export async function deleteUser(request: APIRequestContext, token: string, id: string): Promise<void> {
  const res = await request.delete(`/api/users/${id}`, { headers: bearer(token) });
  await expectOk(res, `DELETE /api/users/${id}`);
}

/** GET /api/roles. */
export async function listRoles(request: APIRequestContext, token: string): Promise<ApiRole[]> {
  const res = await request.get('/api/roles', { headers: bearer(token) });
  await expectOk(res, 'GET /api/roles');
  return (await res.json()) as ApiRole[];
}

/** POST /api/roles con una lista de permisos. */
export async function createRole(
  request: APIRequestContext,
  token: string,
  input: { name: string; description?: string; permissions: string[] },
): Promise<ApiRole> {
  const res = await request.post('/api/roles', { headers: bearer(token), data: input });
  await expectOk(res, 'POST /api/roles');
  return (await res.json()) as ApiRole;
}

/** POST /api/agent/ingest (roleScope = nombres de rol). */
export async function ingestDocument(
  request: APIRequestContext,
  token: string,
  input: { docId: string; source: string; roleScope: string[]; text: string },
): Promise<{ docId: string; chunks: number }> {
  const res = await request.post('/api/agent/ingest', { headers: bearer(token), data: input });
  await expectOk(res, 'POST /api/agent/ingest');
  return (await res.json()) as { docId: string; chunks: number };
}

/** GET /api/audit/events con filtros opcionales. */
export async function listAuditEvents(
  request: APIRequestContext,
  token: string,
  query: Record<string, string | number>,
): Promise<{ items: unknown[]; total: number }> {
  const params = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  const res = await request.get(`/api/audit/events?${params.toString()}`, { headers: bearer(token) });
  await expectOk(res, 'GET /api/audit/events');
  return (await res.json()) as { items: unknown[]; total: number };
}

/** Borra usuarios cuyo email empieza por e2e- (limpieza al terminar la suite). */
export async function cleanupE2eUsers(request: APIRequestContext): Promise<number> {
  const token = await adminToken(request);
  const doomed: string[] = [];
  for (let page = 1; ; page++) {
    const res = await request.get(`/api/users?page=${page}&limit=100`, { headers: bearer(token) });
    await expectOk(res, 'GET /api/users');
    const body = (await res.json()) as { items: ApiUser[]; total: number };
    doomed.push(...body.items.filter((u) => u.email.startsWith('e2e-')).map((u) => u.id));
    if (body.items.length === 0 || page * 100 >= body.total) break;
  }
  for (const id of doomed) await deleteUser(request, token, id);
  return doomed.length;
}
