import { expect, test, type Page } from '@playwright/test';
import { ROLE_IDS, USER_PASSWORD, adminToken, createLoginableUser, createRole, loginUI, uniqName } from './fixtures';

const navLinks = (page: Page) => page.getByRole('navigation', { name: 'Principal' }).getByRole('link');
const homeCards = (page: Page) => page.locator('.home-grid .home-card strong');

test.describe('permisos por rol', () => {
  test('auditor ve solo Auditoría y no puede listar usuarios', async ({ page, request }) => {
    const token = await adminToken(request);
    const name = uniqName('aud');
    const email = `${name}@toka.local`;
    await createLoginableUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.auditor });

    await loginUI(page, email, USER_PASSWORD);
    await expect(navLinks(page)).toHaveText(['Toka', 'Inicio', 'Auditoría']);
    await expect(homeCards(page)).toHaveText(['Auditoría']);

    // /users no tiene guard de permiso en el cliente: la página carga y la API responde 403.
    await page.goto('/users');
    await expect(page.getByRole('alert')).toContainText(/Permiso requerido|No tienes permisos/);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('rol personalizado con solo agent:ask aterriza en Inicio con la tarjeta Agente', async ({ page, request }) => {
    const token = await adminToken(request);
    const role = await createRole(request, token, { name: uniqName('role'), permissions: ['agent:ask'] });
    const name = uniqName('agt');
    const email = `${name}@toka.local`;
    await createLoginableUser(request, token, { name, email, password: USER_PASSWORD, roleId: role.id });

    await loginUI(page, email, USER_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(homeCards(page)).toHaveText(['Agente']);
  });

  test('operador ve Usuarios pero no el botón Nuevo usuario', async ({ page, request }) => {
    const token = await adminToken(request);
    const name = uniqName('opr');
    const email = `${name}@toka.local`;
    await createLoginableUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.operador });

    await loginUI(page, email, USER_PASSWORD);
    await expect(navLinks(page).filter({ hasText: 'Usuarios' })).toBeVisible();
    await page.goto('/users');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo usuario' })).toHaveCount(0);
  });
});
