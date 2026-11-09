import { expect, test } from '@playwright/test'

test('does not request persistence on page load and reports a denied request after profile creation', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        return false
      },
    })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('note')).toHaveCount(0)
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Permission test')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('note')).toContainText('Persistent storage was not granted.')
  await expect(page.getByText('This is not a backup.', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(1)
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText('Profile: Permission test')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Profile is read-only' })).toContainText('profile-content changes are blocked.')
  expect(errors).toEqual([])
})

test('blocks storage when OPFS is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: undefined })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('OPFS')
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByText('No fallback storage will be used.', { exact: false })).toBeVisible()
})

test('blocks storage when the host omits isolation headers', async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    const headers = response.headers()
    delete headers['cross-origin-opener-policy']
    delete headers['cross-origin-embedder-policy']
    await route.fulfill({ response, headers })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('COOP and COEP')
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('remains usable and explains when persistence permission is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: undefined })
    Object.defineProperty(navigator.storage, 'persist', { value: undefined })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('note')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Local despite permission')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByText('not supported by this browser')).toBeVisible()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText('Profile: Local despite permission')).toBeVisible()
})

test('reports initialization failure and supports retry', async ({ page }) => {
  await page.route('**/*.wasm', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Local storage is unavailable.')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.unroute('**/*.wasm')
  await page.getByRole('button', { name: 'Retry storage setup' }).click()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})
