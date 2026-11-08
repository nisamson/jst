import { expect, test } from '@playwright/test'

test('simulated setup persists per profile without changing local profile metadata', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  for (const label of ['Profile one', 'Profile two']) {
    await page.getByRole('button', { name: 'Create profile', exact: true }).click()
    const form = page.locator('form')
    await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
    await form.getByRole('button', { name: 'Create profile' }).click()
    await expect(page.getByRole('button', { name: `Set up simulated sync for ${label}` })).toBeVisible()
  }

  await page.reload()
  await page.getByRole('button', { name: 'Set up simulated sync for Profile one' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated sync setup' })).toBeVisible()
  await expect(page.getByText('Listing them does not import, restore')).toBeVisible()
  await page.getByRole('button', { name: 'Connect simulated provider' }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated setup complete')
  await expect(page.getByRole('alert')).toContainText('No data has been synced or backed up.')
  await page.getByRole('button', { name: 'Continue locally' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Set up simulated sync for Profile two' }).click()
  await expect(page.getByRole('button', { name: 'Connect simulated provider' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue locally' }).click()

  await page.getByRole('button', { name: 'Set up simulated sync for Profile one' }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated setup complete')
  await expect(page.getByRole('button', { name: 'Connect simulated provider' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue locally' }).click()
  await expect(page.getByRole('button', { name: 'Set up simulated sync for Profile one' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set up simulated sync for Profile two' })).toBeVisible()
})

test('continuing locally cancels setup without saving connection state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Local only profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('button', { name: 'Set up simulated sync for Local only profile' })).toBeVisible()
  await page.reload()

  await page.getByRole('button', { name: 'Set up simulated sync for Local only profile' }).click()
  await expect(page.getByRole('button', { name: 'Connect simulated provider' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue locally' }).click()
  await page.getByRole('button', { name: 'Set up simulated sync for Local only profile' }).click()
  await expect(page.getByRole('button', { name: 'Connect simulated provider' })).toBeVisible()
})

test('reports setup persistence failures and allows retry without changing the profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This storage-failure setup uses Vite source modules.')
  await page.goto('/')
  const profile = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    return storage.createProfile({ label: 'Retry profile' })
  })
  await page.evaluate(async (profileId) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(profileId)
    try {
      await session.execute(`
        CREATE TRIGGER reject_simulated_setup
        BEFORE INSERT ON simulated_sync_setup
        BEGIN
          SELECT RAISE(FAIL, 'Simulated persistence failure');
        END
      `)
    } finally {
      await session.dispose()
    }
  }, profile.id)
  await page.reload()
  await page.getByRole('button', { name: 'Set up simulated sync for Retry profile' }).click()
  await page.getByRole('button', { name: 'Connect simulated provider' }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated persistence failure')
  await expect(page.getByRole('alert')).toContainText('Your local profile is unchanged.')

  await page.evaluate(async (profileId) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(profileId)
    try {
      await session.execute('DROP TRIGGER reject_simulated_setup')
    } finally {
      await session.dispose()
    }
  }, profile.id)
  await page.getByRole('button', { name: 'Retry setup' }).click()
  await expect(page.getByRole('alert')).toContainText('Simulated setup complete')
})
