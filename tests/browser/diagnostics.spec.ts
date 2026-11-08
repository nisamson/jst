import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    persistRequestCount?: number
  }
}

test('a human can verify reopen/reload persistence, detect a mismatch, and clear test data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Storage diagnostics' }).click()
  await expect(page.getByRole('heading', { name: 'Storage diagnostics', exact: true })).toBeVisible()
  const result = page.getByRole('status', { name: 'Diagnostic result' })
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeDisabled()
  await page.getByRole('button', { name: 'Write and reopen test record' }).click()
  await expect(result).toContainText('verified after closing and reopening')
  const token = await page.locator('dd code').textContent()
  const writtenAt = await page.locator('dd time').getAttribute('datetime')
  expect(new URL(page.url()).searchParams.get('probe')).toBe(token)

  await page.getByRole('button', { name: 'Reload page' }).click()
  await expect(result).toContainText('Read the saved record')
  await page.getByRole('button', { name: 'Read saved test record' }).click()
  await expect(result).toContainText('matches the expected token')
  await expect(page.locator('dd code')).toHaveText(token!)
  await expect(page.locator('dd time')).toHaveAttribute('datetime', writtenAt!)

  await page.goto('/diagnostics/storage?probe=unexpected-token')
  await page.getByRole('button', { name: 'Read saved test record' }).click()
  await expect(page.getByRole('alert')).toContainText('does not match')
  await expect(page.locator('dd code')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear diagnostic test data' }).click()
  await expect(result).toContainText('test data cleared')
  expect(new URL(page.url()).searchParams.has('probe')).toBe(false)
  await expect(page.getByRole('button', { name: 'Reload page' })).toBeDisabled()
  await page.getByRole('button', { name: 'Read saved test record' }).click()
  await expect(page.getByRole('alert')).toContainText('No diagnostic record was found')
})

test('unsupported storage does not expose diagnostic actions', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: undefined })
  })
  await page.goto('/diagnostics/storage')
  await expect(page.getByRole('alert')).toContainText('OPFS')
  await expect(page.getByRole('button', { name: 'Write and reopen test record' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Read saved test record' })).toHaveCount(0)
})

test('opening storage diagnostics does not request optional persistence', async ({ page }) => {
  await page.addInitScript(() => {
    window.persistRequestCount = 0
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', {
      value: async () => {
        window.persistRequestCount = (window.persistRequestCount ?? 0) + 1
        return true
      },
    })
  })
  await page.goto('/diagnostics/storage')
  await expect(page.getByRole('note')).toHaveCount(0)
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
  await page.getByRole('button', { name: 'Write and reopen test record' }).click()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('verified after closing and reopening')
  await page.getByRole('button', { name: 'Read saved test record' }).click()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('matches the expected token')
  expect(await page.evaluate(() => window.persistRequestCount)).toBe(0)
})

test('failed diagnostic writes report no success and can be retried', async ({ page }) => {
  await page.goto('/diagnostics/storage')
  const write = page.getByRole('button', { name: 'Write and reopen test record' })
  await expect(write).toBeVisible()
  await page.route('**/*.wasm', (route) => route.abort())
  await write.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('check failed')
  expect(new URL(page.url()).searchParams.has('probe')).toBe(false)
  await expect(page.locator('dd code')).toHaveCount(0)
  await page.unroute('**/*.wasm')
  await write.click()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('verified after closing and reopening')
})
