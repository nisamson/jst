import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
  await form.getByRole('button', { name: 'Create profile' }).click()
  await expect(page.getByRole('button', { name: `${label} profile` })).toBeVisible()
}

async function seedProfileClaims(page: Page, label: string) {
  return page.evaluate(async (profileLabel) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await storage.listProfiles()).profiles.find((item) => item.label === profileLabel)
    if (!profile) throw new Error(`Profile "${profileLabel}" was not found.`)

    const session = await storage.openProfile(profile.id)
    try {
      const claims = [
        ['claim-newer', 'Claim 2026', '2026-03-01T12:00:00.000Z', '2026-02-01'],
        ['claim-older', 'Claim 2025', '2025-03-01T12:00:00.000Z', null],
      ] as const
      for (const [id, identifier, createdAt, claimStartDate] of claims) {
        await session.execute(
          'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
          [id, identifier, createdAt, claimStartDate],
        )
      }
    } finally {
      await session.dispose()
    }

    return profile.id
  }, label)
}

test('opens an empty profile-scoped overview, survives reload, and switches profiles', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'First profile')
  await createProfile(page, 'Second profile')

  await page.getByRole('button', { name: 'First profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' })).toBeVisible()
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: /create claim/i })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Second profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Second profile')).toBeVisible()
  await expect(page.getByText('Profile: First profile')).toHaveCount(0)
})

test('upgrades an existing version-one profile without losing its metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Legacy profile')

  const migration = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await storage.listProfiles()).profiles.find((item) => item.label === 'Legacy profile')
    if (!profile) throw new Error('Legacy test profile was not found.')
    const legacy = await storage.openProfile(profile.id)
    await legacy.execute('DROP TABLE claims')
    await legacy.execute('PRAGMA user_version = 1')
    await legacy.dispose()

    const migrated = await storage.openProfile(profile.id)
    try {
      const [version] = await migrated.execute('PRAGMA user_version')
      const tables = await migrated.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'claims'")
      return { profile: migrated.profile, version: version?.user_version, claimsTableExists: tables.length === 1 }
    } finally {
      await migrated.dispose()
    }
  })

  expect(migration.profile.label).toBe('Legacy profile')
  expect(migration.version).toBe(2)
  expect(migration.claimsTableExists).toBe(true)
})

test('lists persistent claims, selects their metadata, and isolates them by profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Claims one')
  await createProfile(page, 'Claims two')
  const firstProfileId = await seedProfileClaims(page, 'Claims one')
  const secondProfileId = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await storage.listProfiles()).profiles.find((item) => item.label === 'Claims two')
    if (!profile) throw new Error('Second test profile was not found.')
    const session = await storage.openProfile(profile.id)
    try {
      await session.execute(
        'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
        ['claim-other-profile', 'Claim second profile', '2026-04-01T12:00:00.000Z', null],
      )
    } finally {
      await session.dispose()
    }
    return profile.id
  })

  await page.getByRole('button', { name: 'Claims one profile' }).click()
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()
  await expect(page.getByText('Record created: 2026-03-01T12:00:00.000Z')).toBeVisible()
  await expect(page.getByText('Claim start date: 2026-02-01')).toBeVisible()

  await page.getByRole('button', { name: 'Claim 2025' }).click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${firstProfileId}&claim=claim-older$`))
  await expect(page.getByText('Claim identifier: Claim 2025')).toBeVisible()
  await expect(page.getByText('Claim start date: Not provided')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Claim identifier: Claim 2025')).toBeVisible()

  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Claims two profile' }).click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${secondProfileId}$`))
  await expect(page.getByRole('button', { name: 'Claim second profile' })).toBeVisible()
  await expect(page.getByText('Claim identifier: Claim second profile')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Claim 2025' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toHaveCount(0)
  await expect(page.getByText('Profile: Claims two')).toBeVisible()
})

test('recovers from a stale claim selection by selecting an available claim', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Stale selection profile')
  const profileId = await seedProfileClaims(page, 'Stale selection profile')

  await page.goto(`/claims?profile=${profileId}&claim=deleted-claim`)
  await expect(page.getByRole('alert')).toContainText('The selected claim is unavailable')
  await expect(page.getByRole('heading', { name: 'Claim overview' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Claim 2026' }).click()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('reports claim read failures without showing a partial overview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Invalid claim profile')
  const profileId = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = (await storage.listProfiles()).profiles.find((item) => item.label === 'Invalid claim profile')
    if (!profile) throw new Error('Test profile was not found.')
    const session = await storage.openProfile(profile.id)
    try {
      await session.execute('DROP TABLE claims')
    } finally {
      await session.dispose()
    }
    return profile.id
  })

  await page.goto(`/claims?profile=${profileId}`)
  await expect(page.getByRole('alert')).toContainText('Claims could not be loaded')
  await expect(page.getByRole('alert')).toContainText('no such table: claims')
  await expect(page.getByRole('heading', { name: 'Claim overview' })).toHaveCount(0)
})

test('direct navigation without a usable profile guides the user back to profile selection', async ({ page }) => {
  await page.goto('/claims')
  await expect(page.getByRole('heading', { name: 'Choose a profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})

test('an unavailable profile shows an error without displaying profile content', async ({ page }) => {
  await page.goto('/claims?profile=33333333-3333-4333-8333-333333333333')
  await expect(page.getByRole('alert')).toContainText('This profile could not be opened')
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})
