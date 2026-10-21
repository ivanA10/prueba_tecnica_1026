import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ROLE_IDS, USER_PASSWORD, adminPassword, adminToken, createUser, listAuditEvents, loginUI, uniqName } from './fixtures';

test.describe('auditoría (admin)', () => {
  let adminCtx: BrowserContext;
  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    adminCtx = await browser.newContext();
    adminPage = await adminCtx.newPage();
    await loginUI(adminPage, ADMIN_EMAIL, adminPassword());
  });

  test.afterAll(async () => {
    await adminCtx.close();
  });

  test('tras crear un usuario, Tipo=user muestra eventos user.created', async ({ request }) => {
    const token = await adminToken(request);
    const before = (await listAuditEvents(request, token, { type: 'user.created', limit: 1 })).total;
    const name = uniqName('aud');
    await createUser(request, token, { name, email: `${name}@toka.local`, password: USER_PASSWORD, roleId: ROLE_IDS.operador });

    // Auditoría es consistencia eventual (outbox -> RabbitMQ -> Mongo): esperar a que llegue el evento.
    await expect
      .poll(async () => (await listAuditEvents(request, token, { type: 'user.created', limit: 1 })).total, {
        timeout: 60_000,
        intervals: [1_000, 2_000, 3_000],
      })
      .toBeGreaterThan(before);

    await adminPage.goto('/audit');
    await adminPage.getByLabel('Tipo').fill('user');
    await expect(adminPage.getByText('user.created').first()).toBeVisible();
  });

  test('Actor=sys muestra eventos del sistema o un vacío, sin error', async () => {
    await adminPage.goto('/audit');
    await adminPage.getByLabel('Actor').fill('sys');
    await expect(
      adminPage.locator('.actor-system').or(adminPage.getByText('Ningún evento coincide con los filtros.')).first(),
    ).toBeVisible();
    await expect(adminPage.getByRole('alert')).toHaveCount(0);
  });

  test('la paginación muestra Anterior y Siguiente', async () => {
    await adminPage.goto('/audit');
    await expect(adminPage.getByText(/Página 1 de \d+/)).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await expect(adminPage.getByRole('button', { name: 'Siguiente' })).toBeVisible();
  });
});
