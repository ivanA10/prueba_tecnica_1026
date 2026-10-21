import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_EMAIL, adminPassword, adminToken, createRole, loginUI, uniqName } from './fixtures';

test.describe('roles y permisos (admin)', () => {
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

  async function openRoles(): Promise<void> {
    await adminPage.goto('/roles');
    await expect(adminPage.getByRole('table')).toBeVisible();
  }

  test('crear un rol con casillas de permisos', async () => {
    const name = uniqName('role');
    await openRoles();
    await adminPage.getByRole('button', { name: 'Crear rol' }).click();
    const dialog = adminPage.getByRole('form', { name: 'Nuevo rol' });
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByLabel('Descripción').fill('Rol de prueba E2E');
    await dialog.getByLabel('Ver usuarios').check();
    await dialog.getByLabel('Ver auditoría').check();
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(adminPage.getByText('Rol creado')).toBeVisible();
    const row = adminPage.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('Ver usuarios');
    await expect(row).toContainText('Ver auditoría');
  });

  test('"Todos los permisos (*)" deshabilita los demás permisos', async () => {
    await openRoles();
    await adminPage.getByRole('button', { name: 'Crear rol' }).click();
    const dialog = adminPage.getByRole('form', { name: 'Nuevo rol' });
    await dialog.getByLabel('Todos los permisos (*)').check();
    await expect(dialog.getByLabel('Ver usuarios')).toBeDisabled();
    await expect(dialog.getByLabel('Gestionar roles')).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('editar la descripción de un rol', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('role');
    await createRole(request, token, { name, description: 'Descripción inicial E2E', permissions: ['roles:read'] });

    await openRoles();
    await adminPage.getByRole('button', { name: `Editar ${name}` }).click();
    const dialog = adminPage.getByRole('form', { name: 'Editar rol' });
    await dialog.getByLabel('Descripción').fill('Descripción editada E2E');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(adminPage.getByText('Rol actualizado')).toBeVisible();
    await expect(adminPage.getByRole('row').filter({ hasText: name })).toContainText('Descripción editada E2E');
  });

  test('la pantalla de roles no ofrece eliminar un rol', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('role');
    await createRole(request, token, { name, permissions: ['users:read'] });

    await openRoles();
    const row = adminPage.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button')).toHaveCount(1); // solo "Editar"
    await expect(adminPage.getByRole('button', { name: /eliminar/i })).toHaveCount(0);
  });

  test('la matriz de Permisos muestra la columna del rol nuevo', async ({ request }) => {
    const token = await adminToken(request);
    const name = uniqName('role');
    await createRole(request, token, { name, permissions: ['audit:read'] });

    await adminPage.goto('/permissions');
    const matrix = adminPage.getByRole('table', { name: 'Matriz de roles y permisos' });
    await expect(matrix).toBeVisible();
    // Las cabeceras <th> se exponen como "cell" en el árbol de accesibilidad, así que se busca por texto.
    await expect(matrix.getByText(name, { exact: true })).toBeVisible();
    await expect(adminPage.getByRole('img', { name: `${name} tiene audit:read` })).toBeVisible();
  });
});
