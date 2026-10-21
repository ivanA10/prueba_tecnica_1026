import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Un test puede esperar varios minutos si el login cae en el rate limit de nginx (5 r/min).
  timeout: 180_000,
  expect: { timeout: 10_000 },
  globalTeardown: require.resolve('./global-teardown'),
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    // Off by default: traces record fill() values, including the admin password. Opt in with E2E_TRACE=1.
    trace: process.env.E2E_TRACE === '1' ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
