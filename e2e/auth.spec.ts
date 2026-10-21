import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, adminPassword, loginUI } from './fixtures';

test.describe('autenticación', () => {
  test('login inválido muestra un error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login de admin aterriza en Inicio con las cinco tarjetas', async ({ page }) => {
    await loginUI(page, ADMIN_EMAIL, adminPassword());
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(page.locator('.home-grid .home-card strong')).toHaveText(['Usuarios', 'Roles', 'Permisos', 'Auditoría', 'Agente']);
  });

  test('salir devuelve a la pantalla de login', async ({ page }) => {
    await loginUI(page, ADMIN_EMAIL, adminPassword());
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('/users sin sesión redirige a login', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
