import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    restoreDirectory?: () => void
  }
}

test('lists and opens the selected profile, then switches without retaining the prior selection', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const profiles = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const first = await storage.createProfile({ label: 'Profile one', realName: 'Alex One' })
    const second = await storage.createProfile({ label: 'Profile two', realName: 'Riley Two' })
    return { first, second }
  })
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const firstOption = page.getByRole('button', { name: 'Profile one profile' })
  const secondOption = page.getByRole('button', { name: 'Profile two profile' })
  await expect(firstOption).toBeVisible()
  await expect(secondOption).toBeVisible()
  await secondOption.focus()
  await page.keyboard.press('Enter')
  await expect(secondOption).toHaveAttribute('aria-pressed', 'true')
  await expect(firstOption).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Profile two is selected and open.')).toBeVisible()

  await firstOption.click()
  await expect(firstOption).toHaveAttribute('aria-pressed', 'true')
  await expect(secondOption).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Profile one is selected and open.')).toBeVisible()
  expect(profiles.first.id).not.toBe(profiles.second.id)
})

test('reports discovery failure and recovers when profile discovery is retried', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()

  await page.evaluate(() => {
    const storage = navigator.storage
    const original = storage.getDirectory.bind(storage)
    Object.defineProperty(storage, 'getDirectory', {
      configurable: true,
      value: () => Promise.reject(new Error('OPFS directory is temporarily unavailable')),
    })
    Object.defineProperty(window, 'restoreDirectory', {
      configurable: true,
      value: () => Object.defineProperty(storage, 'getDirectory', { configurable: true, value: original }),
    })
  })
  await page.getByRole('button', { name: 'Retry profile discovery' }).click()
  await expect(page.getByRole('alert')).toContainText('OPFS directory is temporarily unavailable')
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toHaveCount(0)

  await page.evaluate(() => {
    window.restoreDirectory?.()
  })
  await page.getByRole('button', { name: 'Retry profile discovery' }).click()
  await expect(page.getByRole('heading', { name: 'No local profiles yet' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('reports corrupt profile files while keeping valid profiles available', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const validProfile = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    return storage.createProfile({ label: 'Available profile' })
  })
  const corruptId = '33333333-3333-4333-8333-333333333333'
  await page.evaluate(async (id) => {
    const directory = await navigator.storage.getDirectory()
    await directory.getFileHandle(`profile-${id}.sqlite3`, { create: true })
  }, corruptId)
  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  await expect(page.getByRole('button', { name: 'Available profile profile' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(corruptId)
  await page.getByRole('button', { name: 'Available profile profile' }).click()
  await expect(page.getByText('Available profile is selected and open.')).toBeVisible()
  expect(validProfile.id).not.toBe(corruptId)
})
