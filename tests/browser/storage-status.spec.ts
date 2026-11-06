import { expect, test } from '@playwright/test'

test('initializes the real SQLite worker and reports persistence limitations', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { value: async () => false })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('note')).toContainText('Persistent storage was not granted.')
  await expect(page.getByText('This is not a backup.', { exact: false })).toBeVisible()
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

test('remains usable when persistence permission cannot be requested', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: undefined })
    Object.defineProperty(navigator.storage, 'persist', { value: undefined })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('note')).toContainText('not supported by this browser')
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
