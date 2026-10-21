import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ROLE_IDS, USER_PASSWORD, adminPassword, adminToken, createUser, loginUI, uniqName } from './fixtures';

test.describe('gestión de usuarios (admin)', () => {
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

  async function openUsers(): Promise<void> {
    await adminPage.goto('/users');
    await expect(adminPage.getByRole('table')).toBeVisible();
  }

  /** El listado va por createdAt asc y el filtro de búsqueda solo mira la página actual: hay que ir a la última. */
  async function goToLastPage(): Promise<void> {
    const info = adminPage.locator('.pager-info');
    await expect(adminPage.getByRole('table')).toBeVisible();
    const last = Number((await info.textContent())?.match(/de (\d+)/)?.[1] ?? 1);
    for (let p = 1; p < last; p++) {
      await Promise.all([
        adminPage.waitForResponse((r) => r.url().includes('/api/users?') && r.ok()),
        adminPage.getByRole('button', { name: 'Siguiente' }).click(),
      ]);
    }
    await expect(info).toHaveText(`Página ${last} de ${last}`);
  }

  async function searchFor(email: string): Promise<void> {
    await adminPage.getByLabel('Buscar usuarios').fill(email);
    await expect(adminPage.getByRole('table').getByText(email, { exact: true })).toBeVisible();
  }

  test('admin crea un usuario desde el diálogo y lo encuentra con el filtro', async () => {
    await openUsers();
    await adminPage.getByRole('button', { name: 'Nuevo usuario' }).click();
    const dialog = adminPage.getByRole('form', { name: 'Nuevo usuario' });
    const name = uniqName('usr');
    const email = `${name}@toka.local`;
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Contraseña').fill(USER_PASSWORD);
    await dialog.getByLabel('Rol').selectOption({ label: 'auditor' });
    await dialog.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(adminPage.getByText('Usuario creado')).toBeVisible();
    await expect(dialog).toBeHidden();
    await goToLastPage();
    await searchFor(email);
  });

  test('editar el nombre de un usuario se refleja en la tabla', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('usr');
    const email = `${name}@toka.local`;
    await createUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.operador });

    await openUsers();
    await goToLastPage();
    await searchFor(email);
    await adminPage.getByRole('button', { name: `Editar ${name}` }).click();
    const dialog = adminPage.getByRole('form', { name: 'Editar usuario' });
    const renamed = `${name}-editado`;
    await dialog.getByLabel('Nombre').fill(renamed);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(adminPage.getByText('Usuario actualizado')).toBeVisible();
    await expect(adminPage.getByRole('table').getByText(renamed, { exact: true })).toBeVisible();
  });

  test('cambiar el rol en línea asigna el nuevo rol', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('usr');
    const email = `${name}@toka.local`;
    await createUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.auditor });

    await openUsers();
    await goToLastPage();
    await searchFor(email);
    const select = adminPage.getByLabel(`Rol de ${name}`);
    await select.selectOption({ label: 'operador' });
    await expect(adminPage.getByText('Rol asignado')).toBeVisible();
    await expect(select).toHaveValue(ROLE_IDS.operador);
  });

  test('eliminar un usuario pide confirmación y lo quita de la tabla', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('usr');
    const email = `${name}@toka.local`;
    await createUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.auditor });

    await openUsers();
    await goToLastPage();
    await searchFor(email);
    await adminPage.getByRole('button', { name: `Eliminar ${name}` }).click();
    const confirm = adminPage.getByRole('dialog', { name: 'Confirmación' });
    await expect(confirm).toContainText(`¿Eliminar a ${name}?`);
    await confirm.getByRole('button', { name: 'Confirmar' }).click();
    await expect(adminPage.getByText('Usuario eliminado')).toBeVisible();
    await expect(adminPage.getByText(email, { exact: true })).toHaveCount(0);
  });
});
