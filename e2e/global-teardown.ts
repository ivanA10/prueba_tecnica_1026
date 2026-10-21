import { request, type FullConfig } from '@playwright/test';
import { BASE_URL, cleanupE2eUsers } from './fixtures';

/** Al terminar la suite borra los usuarios e2e-* que quedaron, para que las páginas no crezcan entre ejecuciones. */
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    const removed = await cleanupE2eUsers(ctx);
    console.log(`[e2e] usuarios de prueba eliminados: ${removed}`);
  } catch (err) {
    console.warn(`[e2e] limpieza omitida: ${(err as Error).message}`);
  } finally {
    await ctx.dispose();
  }
}
