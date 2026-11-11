import { expect, test } from '@playwright/test'

test('serves install metadata and square app icons', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('production'), 'The PWA service worker is enabled only for production builds.')

  const manifestResponse = await page.request.get('/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json() as {
    name: string
    short_name: string
    start_url: string
    display: string
    theme_color: string
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
  }
  expect(manifest).toMatchObject({
    name: 'Job Search Tracker',
    short_name: 'JST',
    start_url: '/',
    display: 'standalone',
    theme_color: '#365a7a',
  })

  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find((item) => item.sizes === size)
    if (!icon) throw new Error(`Missing ${size} app icon.`)
    expect(icon.purpose).toContain('maskable')
    const response = await page.request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    expect(await response.text()).toContain('JST')
  }
  const logoResponse = await page.request.get('/jst-logo.svg')
  expect(logoResponse.ok()).toBe(true)
  expect(logoResponse.headers()['content-type']).toContain('image/svg+xml')
  expect(await logoResponse.text()).toContain('JST')


  const appResponse = await page.request.get('/')
  expect(appResponse.headers()).toMatchObject({
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-opener-policy': 'same-origin',
  })
  await page.goto('/')
  const headers = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }))
  expect(headers).toEqual({ manifest: '/manifest.webmanifest', themeColor: '#365a7a' })
  expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('/jst-logo.svg')
})

test('reloads a profile from the cached shell while offline without caching profile databases', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('production'), 'The PWA service worker is enabled only for production builds.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  await page.evaluate(() => navigator.serviceWorker.ready)
  const createProfileButton = page.getByRole('button', { name: 'Create profile', exact: true })
  await expect(createProfileButton).toBeEnabled()
  await createProfileButton.click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Offline profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText('Profile: Offline profile')).toBeVisible()

  await page.reload()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const cacheState = await page.evaluate(async () => {
    const cacheNames = await caches.keys()
    const urls = (await Promise.all(
      cacheNames.map(async (name) => {
        const cache = await caches.open(name)
        return (await cache.keys()).map((request) => request.url)
      }),
    )).flat()
    return {
      hasOfflineShell: urls.some((url) => new URL(url).pathname === '/index.html'),
      hasSqliteWasm: urls.some((url) => /\.wasm(?:$|\?)/.test(url)),
      hasSqliteWorker: urls.some((url) => /sqlite.worker.*\.js/.test(url)),
      hasOpfsWorkerVariants: ['?vfs=opfs', '?vfs=opfs-wl'].every((query) =>
        urls.some((url) => url.includes(query))),
      cachesProfileDatabase: urls.some((url) => /profile-[0-9a-f-]+\.sqlite3/i.test(url)),
      wasmUrl: urls.find((url) => /\.wasm(?:$|\?)/.test(url)),
    }
  })
  expect(cacheState).toEqual({
    hasOfflineShell: true,
    hasSqliteWasm: true,
    hasSqliteWorker: true,
    hasOpfsWorkerVariants: true,
    cachesProfileDatabase: false,
    wasmUrl: expect.stringMatching(/\.wasm/),
  })
  if (!cacheState.wasmUrl) throw new Error('The SQLite WASM file was not cached.')
  const wasmResponse = await page.request.get(cacheState.wasmUrl)
  expect(wasmResponse.headers()['content-type']).toContain('application/wasm')

  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  await expect(page.getByText('Profile: Offline profile')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'You are offline' })).toContainText('not backed up')

  await page.goto('/diagnostics/storage')
  await expect(page.getByRole('heading', { name: 'Storage diagnostics' })).toBeVisible()
  await page.context().setOffline(false)
})

test('stages an app update until requested and keeps the existing profile database', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-production', 'Service worker update activation is checked in Chromium production.')

  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.goto('http://127.0.0.1:4178/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.evaluate(() => navigator.serviceWorker.ready)

  const createProfileButton = page.getByRole('button', { name: 'Create profile', exact: true })
  await expect(createProfileButton).toBeEnabled()
  await createProfileButton.click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Update-safe profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText('Profile: Update-safe profile')).toBeVisible()
  await page.reload()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  const updateResponse = await page.request.post('http://127.0.0.1:4178/__test/update')
  expect(updateResponse.ok()).toBe(true)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/')
    if (!registration) throw new Error('The app service worker was not registered.')
    await registration.update()
  })
  await expect(page.getByRole('alert').filter({ hasText: 'An app update is ready' })).toBeVisible()
  await page.getByRole('button', { name: 'Reload to update' }).click()
  await expect(page.getByText('Profile: Update-safe profile')).toBeVisible()

  await expect.poll(() => page.evaluate(() => window.caches.keys())).toEqual(['jst-shell-update-test'])
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await expect(page.getByRole('button', { name: 'Update-safe profile profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Update-safe profile profile' }).click()
  await expect(page.getByText('Profile: Update-safe profile')).toBeVisible()
})
