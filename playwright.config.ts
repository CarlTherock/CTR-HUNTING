import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_PATH = '/CTR-HUNTING/'

/**
 * E2E configuration. The app is built exactly like the GitHub Pages
 * deployment (subpath base) but with fixed, FAKE provider keys: tests talk
 * to a simulated map backend (`e2e/support/mockMapBackend.ts`), never to
 * MapTiler/Esri, so they are deterministic and need no secret.
 *
 * Chromium runs everywhere. WebKit (closest available engine to iOS
 * Safari) is enabled with PLAYWRIGHT_WEBKIT=1 — emulated WebKit is NOT
 * proof that the app works on a physical iPhone.
 */
const withWebkit = process.env.PLAYWRIGHT_WEBKIT === '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // WebGL in headless Chromium goes through SwiftShader.
        launchOptions: {
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    ...(withWebkit ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }] : []),
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      GITHUB_PAGES: 'true',
      // The simulated backend's hosts, allowed in this E2E build only.
      CSP_EXTRA_HOSTS:
        'https://tiles.e2e.test,https://sprites.e2e.test,https://glyphs.e2e.test',
      VITE_MAP_TILES_API_KEY: 'e2e-fake-maptiler-key',
      VITE_ESRI_API_KEY: 'e2e-fake-esri-key',
      // Short sweep-step timeout so the failing-tiles download test stays fast.
      VITE_OFFLINE_STEP_TIMEOUT_MS: '4000',
    },
  },
})
