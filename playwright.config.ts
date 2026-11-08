import { defineConfig, devices } from '@playwright/test'

const browsers = [
  ['chromium', 'Desktop Chrome'],
  ['firefox', 'Desktop Firefox'],
  ['webkit', 'Desktop Safari'],
] as const

// Windows WebKit times out starting SQLite's nested OPFS proxy worker.
const availableBrowsers = browsers.filter(([browser]) => browser !== 'webkit' || process.platform !== 'win32')
if (process.platform === 'win32' && process.env.TEST_WORKER_INDEX === undefined) {
  console.info('WebKit projects excluded on Windows: SQLite OPFS proxy initialization is unavailable. Chromium and Firefox will run.')
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    trace: 'retain-on-failure',
  },
  projects: availableBrowsers.flatMap(([browser, device]) => [
    {
      name: `${browser}-development`,
      use: { ...devices[device], baseURL: 'http://127.0.0.1:4176' },
    },
    {
      name: `${browser}-production`,
      testIgnore: ['**/storage.spec.ts', '**/profiles.spec.ts', '**/profile-landing.spec.ts'],
      use: { ...devices[device], baseURL: 'http://127.0.0.1:4177' },
    },
  ]),
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4177 --strictPort',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false,
    },
  ],
})
