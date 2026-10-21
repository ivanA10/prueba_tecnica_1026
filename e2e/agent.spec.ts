import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ROLE_IDS, USER_PASSWORD, adminPassword, adminToken, createLoginableUser, ingestDocument, loginUI, uniqName } from './fixtures';

/** Documento con un token único en la primera frase: el mock LLM devuelve las primeras frases del fragmento. */
const docText = (marker: string): string =>
  `# Política de reembolsos E2E\n\nEl código de reembolso vigente es ${marker}. Los reembolsos se aprueban en tres días hábiles.\n`;

test.describe('agente', () => {
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

  test('admin indexa un .md desde Cargar conocimiento', async () => {
    const stamp = Date.now();
    const docId = `e2e-${stamp}-politica`;
    const fileName = `${docId}.md`;
    const marker = `CODIGO${stamp}`;

    await adminPage.goto('/agent');
    await adminPage.locator('.seg-opt', { hasText: 'Cargar conocimiento' }).click();
    await expect(adminPage.getByRole('radio', { name: 'Cargar conocimiento' })).toBeChecked();
    const form = adminPage.getByRole('form', { name: 'Cargar conocimiento' });
    await form.getByLabel('Archivo (.md, .txt)').setInputFiles({
      name: fileName,
      mimeType: 'text/markdown',
      buffer: Buffer.from(docText(marker)),
    });
    await expect(form.getByLabel('Identificador')).toHaveValue(docId);
    await form.getByRole('checkbox', { name: 'admin', exact: true }).check();
    await form.getByRole('button', { name: 'Indexar documento' }).click();
    await expect(adminPage.getByText(/Documento indexado/)).toBeVisible();
  });

  test('pregunta sobre el contenido indexado devuelve la fuente citada', async ({ request }) => {
    const token = await adminToken(request);
    const stamp = Date.now();
    const source = `e2e-${stamp}-ask.md`;
    const marker = `CODIGO${stamp}`;
    await ingestDocument(request, token, { docId: `e2e-${stamp}-ask`, source, roleScope: ['admin'], text: docText(marker) });

    await adminPage.goto('/agent');
    await adminPage.getByRole('textbox', { name: 'Pregunta', exact: true }).fill(`¿Cuál es el código de reembolso ${marker}?`);
    await adminPage.getByRole('button', { name: 'Preguntar' }).click();
    await expect(adminPage.locator('.msg:not(.is-user)').getByText(marker)).toBeVisible({ timeout: 45_000 });
    await expect(adminPage.getByRole('list', { name: 'Fuentes' }).getByText(source)).toBeVisible();
  });

  test('sin agent:ingest no aparece el selector de modo', async ({ page, request }) => {
    const token = await adminToken(request);
    const name = uniqName('agt');
    const email = `${name}@toka.local`;
    // operador tiene agent:ask pero no agent:ingest
    await createLoginableUser(request, token, { name, email, password: USER_PASSWORD, roleId: ROLE_IDS.operador });

    await loginUI(page, email, USER_PASSWORD);
    await page.goto('/agent');
    await expect(page.getByRole('textbox', { name: 'Pregunta', exact: true })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Modo' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Cargar conocimiento' })).toHaveCount(0);
  });
});
