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
    await page.getByRole('button', { name: 'Continue without syncing' }).click()
    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
    await expect(page.getByRole('button', { name: `Set up sync for ${label}` })).toBeVisible()
  }

  const firstSync = page.getByRole('button', { name: 'Set up sync for Profile one' })
  await expect(firstSync).toHaveAccessibleName('Set up sync for Profile one — not configured')
  const openButton = page.getByRole('button', { name: 'Profile one profile' })
  const openColor = await openButton.evaluate((element) => getComputedStyle(element).backgroundColor)
  const unconfiguredColor = await firstSync.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(unconfiguredColor).not.toBe(openColor)
  await expect(firstSync.locator('svg')).toHaveClass(/tabler-icon-cloud-off/)
  await firstSync.hover()
  await expect(page.getByRole('tooltip', { name: 'No sync setup. Open sync setup.' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Set up sync for Profile one' }).click()
  await expect(page.getByRole('heading', { name: 'Sync setup' })).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Simulated storage')
  await expect(page.getByRole('dialog')).not.toContainText('Simulated setup')
  await expect(page.getByText('Listing them does not import, restore')).toBeVisible()
  await page.getByRole('button', { name: 'Connect provider' }).click()
  await expect(page.getByRole('alert')).toContainText('Setup complete')
  await expect(page.getByRole('alert')).toContainText('No data has been synced or backed up.')
  await page.keyboard.press('Escape')
  await expect(firstSync).toHaveAccessibleName('Set up sync for Profile one — setup saved')
  await expect(firstSync.locator('svg')).toHaveClass(/tabler-icon-cloud-check/)
  expect(await firstSync.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(unconfiguredColor)

  await page.reload()
  await page.getByRole('button', { name: 'Set up sync for Profile two' }).click()
  await expect(page.getByRole('button', { name: 'Connect provider' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue without syncing' }).click()

  await page.getByRole('button', { name: 'Set up sync for Profile one' }).click()
  await expect(page.getByRole('alert')).toContainText('Setup complete')
  await page.getByRole('button', { name: 'Run setup again' }).click()
  await expect(page.getByText('Setup completed again. No data has been synced or backed up.')).toBeVisible()
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByText('This removes the setup, not your local profile or records.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Setup complete')
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByText('Sync setup removed. Local profile data was not deleted.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect provider' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Set up sync for Profile one' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set up sync for Profile two' })).toBeVisible()
  await expect(firstSync).toHaveAccessibleName('Set up sync for Profile one — not configured')
  expect(await firstSync.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(openColor)
  await page.reload()
  await expect(firstSync).toHaveAccessibleName('Set up sync for Profile one — not configured')
})

test('removing setup preserves claims and restores read-only access when persistence is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Profile label' }).fill('Removal profile')
  await page.locator('form').getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Connect provider' }).click()
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  const claim = page.getByRole('dialog', { name: 'Create claim' })
  await claim.getByRole('textbox', { name: 'Claim identifier' }).fill('Preserved claim')
  await claim.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(page.getByText('Claim identifier: Preserved claim')).toBeVisible()
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  const sync = page.getByRole('button', { name: 'Set up sync for Removal profile' })
  await expect(sync).toHaveAccessibleName('Set up sync for Removal profile — setup saved')
  await sync.click()
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByText('this profile may become read-only', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByText('Sync setup removed. Local profile data was not deleted.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sync).toHaveAccessibleName('Set up sync for Removal profile — not configured')
  await page.getByRole('button', { name: 'Removal profile profile' }).click()
  await expect(page.getByRole('note', { name: 'Profile is read-only' })).toBeVisible()
  await expect(page.getByText('Claim identifier: Preserved claim')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create claim', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByText('Claim identifier: Preserved claim')).toBeVisible()
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
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await expect(page.getByRole('button', { name: 'Set up sync for Local only profile' })).toBeVisible()
  await page.reload()

  await page.getByRole('button', { name: 'Set up sync for Local only profile' }).click()
  await expect(page.getByRole('button', { name: 'Connect provider' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await page.getByRole('button', { name: 'Set up sync for Local only profile' }).click()
  await expect(page.getByRole('button', { name: 'Connect provider' })).toBeVisible()
})

test('simulated setup makes an unverified profile writable without granting persistence', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This storage-access check uses Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill('Simulated access profile')
  await form.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Connect provider' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Simulated access profile')).toBeVisible()

  const access = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await profiles.listProfiles()).profiles[0]
    if (!profile) throw new Error('Test profile was not found.')
    const session = await profiles.openProfile(profile.id)
    try {
      return session.access
    } finally {
      await session.dispose()
    }
  })
  expect(access).toEqual({ mode: 'read-write', persistence: 'denied', syncConnected: true })
})

test('reports setup persistence failures and allows retry without changing the profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This storage-failure setup uses Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
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
  await page.getByRole('button', { name: 'Set up sync for Retry profile' }).click()
  await page.getByRole('button', { name: 'Connect provider' }).click()
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
  await expect(page.getByRole('alert')).toContainText('Setup complete')

  await page.evaluate(async (profileId) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(profileId)
    try {
      await session.execute(`
        CREATE TRIGGER reject_sync_removal
        BEFORE DELETE ON simulated_sync_setup
        BEGIN
          SELECT RAISE(FAIL, 'Removal failed');
        END
      `)
    } finally {
      await session.dispose()
    }
  }, profile.id)
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByRole('alert', { name: 'Remove sync setup?' })).toContainText('Removal failed')
  await expect(page.getByRole('alert').filter({ hasText: 'Setup complete' })).toBeVisible()
  await page.evaluate(async (profileId) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(profileId)
    try {
      await session.execute('DROP TRIGGER reject_sync_removal')
    } finally {
      await session.dispose()
    }
  }, profile.id)
  await page.getByRole('button', { name: 'Remove sync setup' }).click()
  await expect(page.getByText('Sync setup removed. Local profile data was not deleted.')).toBeVisible()
})
