import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
  await form.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText(`Profile: ${label}`)).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
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
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'First profile')
  await createProfile(page, 'Second profile')

  await page.getByRole('button', { name: 'First profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Claims overview' })).toBeVisible()
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb.getByRole('link', { name: 'Profiles' })).toBeVisible()
  await expect(breadcrumb).toContainText('First profile')
  await expect(breadcrumb).toContainText('Claims')
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create claim', exact: true })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Developer claim tools' })).toBeVisible()

  await page.reload()
  await expect(page.getByText('Profile: First profile')).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Profiles' }).click()
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Second profile profile' }).click()
  await expect(page).toHaveURL(/\/claims\?profile=[0-9a-f-]+$/)
  await expect(page.getByText('Profile: Second profile')).toBeVisible()
  await expect(page.getByText('Profile: First profile')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Second profile')
})

test('upgrades an existing version-one profile without losing its metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
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
    await legacy.execute('DROP TABLE activity_files')
    await legacy.execute('DROP TABLE activity_links')
    await legacy.execute('DROP TABLE activities')
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
  expect(migration.version).toBe(6)
  expect(migration.claimsTableExists).toBe(true)
})

test('lists persistent claims, selects their metadata, and isolates them by profile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
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
  const localizedCreatedAt = await page.evaluate(() => new Date('2026-03-01T12:00:00.000Z').toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }))
  await expect(page.getByRole('heading', { name: 'Claim 2026 overview', exact: true })).toBeVisible()
  const createdTime = page.getByRole('region', { name: 'Claim 2026 overview', exact: true }).locator('time').first()
  await expect(createdTime).toHaveText(localizedCreatedAt)
  await expect(createdTime).toHaveAttribute('dateTime', '2026-03-01T12:00:00.000Z')
  await expect(page.getByText('Claim start date: 2026-02-01')).toBeVisible()

  await page.getByRole('button', { name: 'Claim 2025' }).click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${firstProfileId}&claim=claim-older$`))
  await expect(page.getByText('Claim identifier: Claim 2025')).toBeVisible()
  await expect(page.getByText('Claim start date: Not provided')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Claim 2025', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()
  await page.goForward()
  await expect(page.getByText('Claim identifier: Claim 2025')).toBeVisible()
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

test('requires the exact claim identifier and clears its route after deletion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Delete claim profile')
  const profileId = await seedProfileClaims(page, 'Delete claim profile')
  await page.getByRole('button', { name: 'Delete claim profile profile', exact: true }).click()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()

  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  const firstDialog = page.getByRole('dialog', { name: 'Delete claim?' })
  const firstInput = firstDialog.getByRole('textbox', { name: 'Type claim name to confirm' })
  const firstConfirm = firstDialog.getByRole('button', { name: 'Delete claim' })
  await expect(firstConfirm).toBeDisabled()
  await firstInput.fill('claim 2026')
  await expect(firstConfirm).toBeDisabled()
  await firstDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()

  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await dialog.getByRole('textbox', { name: 'Type claim name to confirm' }).fill('Claim 2026')
  await dialog.getByRole('button', { name: 'Delete claim' }).click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${profileId}$`))
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Claim 2025' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Claim 2025' })).toBeVisible()

  await page.goto(`/claims?profile=${profileId}&claim=claim-newer`)
  await expect(page.getByRole('alert')).toContainText('The selected claim is unavailable')
  await page.getByRole('button', { name: 'Return to claims overview' }).click()
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${profileId}$`))
  await expect(page.getByRole('button', { name: 'Claim 2025' })).toBeVisible()
})

test('deletes only the selected claim when identifiers are duplicated', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Duplicate claim labels')
  const profileId = await seedProfileClaims(page, 'Duplicate claim labels')
  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await profiles.openProfile(id)
    try {
      await session.execute(
        'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
        ['duplicate-claim-id', 'Claim 2026', '2026-02-01T11:00:00.000Z', null],
      )
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.goto(`/claims?profile=${profileId}&claim=duplicate-claim-id`)
  const duplicate = page.getByRole('button', { name: 'Claim 2026, Entry 2', exact: true })
  const original = page.getByRole('button', { name: 'Claim 2026, Entry 1', exact: true })
  await expect(duplicate).toHaveAttribute('aria-pressed', 'true')
  await expect(original).toHaveAttribute('aria-pressed', 'false')
  await expect(duplicate).not.toContainText('duplicate-claim-id')
  await expect(original).not.toContainText('claim-newer')
  await expect(duplicate).toContainText('Created:')
  await expect(original).toContainText('Start date:')
  await original.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`profile=${profileId}&claim=claim-newer$`))
  await expect(page.getByRole('region', { name: 'Claim 2026 overview', exact: true })).toContainText('Record ID: claim-newer')
  await duplicate.focus()
  await page.keyboard.press('Space')
  await expect(page).toHaveURL(new RegExp(`profile=${profileId}&claim=duplicate-claim-id$`))
  await page.reload()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()
  const detail = page.getByRole('region', { name: 'Claim 2026 overview', exact: true })
  await expect(detail.getByText('Record ID: duplicate-claim-id', { exact: true })).toBeHidden()
  await detail.locator('summary').click()
  await expect(detail.getByText('Record ID: duplicate-claim-id', { exact: true })).toBeVisible()
  await original.click()
  await expect(detail.getByText('Record ID: claim-newer', { exact: true })).toBeHidden()
  await duplicate.click()
  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await expect(dialog.getByText('Record ID: duplicate-claim-id', { exact: true })).toBeHidden()
  await expect(dialog).toContainText('Entry 2')
  await dialog.getByRole('textbox', { name: 'Type claim name to confirm' }).fill('Claim 2026')
  await dialog.getByRole('button', { name: 'Delete claim' }).click()
  await expect(dialog).toBeHidden()

  const remainingClaimIds = await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const claimsPath = '/src/storage/claims.ts'
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const session = await profiles.openProfile(id)
    try {
      return (await claims.listClaims(session.execute)).map((claim) => claim.id)
    } finally {
      await session.dispose()
    }
  }, profileId)
  expect(remainingClaimIds).toEqual(['claim-newer', 'claim-older'])
})

test('reports claim deletion failure and allows retry without losing the claim', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Retry claim deletion')
  const profileId = await seedProfileClaims(page, 'Retry claim deletion')
  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await profiles.openProfile(id)
    try {
      await session.execute(`
        CREATE TRIGGER reject_claim_delete
        BEFORE DELETE ON claims
        BEGIN
          SELECT RAISE(FAIL, 'Claim deletion is temporarily unavailable');
        END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.getByRole('button', { name: 'Retry claim deletion profile' }).click()
  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await dialog.getByRole('textbox', { name: 'Type claim name to confirm' }).fill('Claim 2026')
  await dialog.getByRole('button', { name: 'Delete claim' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Claim deletion is temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toBeVisible()

  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await profiles.openProfile(id)
    try {
      await session.execute('DROP TRIGGER reject_claim_delete')
    } finally {
      await session.dispose()
    }
  }, profileId)
  dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await dialog.getByRole('button', { name: 'Delete claim' }).click()
  await expect(page.getByRole('button', { name: 'Claim 2026' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Claim 2025' })).toBeVisible()
})

test('recovers from a stale claim selection by selecting an available claim', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Stale selection profile')
  const profileId = await seedProfileClaims(page, 'Stale selection profile')

  await page.goto(`/claims?profile=${profileId}&claim=deleted-claim`)
  await expect(page.getByRole('alert')).toContainText('The selected claim is unavailable')
  await expect(page.getByRole('heading', { name: / overview$/, level: 2 })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete claim', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Claim 2026' }).click()
  await expect(page.getByText('Claim identifier: Claim 2026')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('reports claim read failures without showing a partial overview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
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
  await expect(page.getByRole('heading', { name: / overview$/, level: 2 })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Claims', exact: true })).toHaveCount(0)

  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      await session.execute('CREATE TABLE claims (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, created_at TEXT NOT NULL, claim_start_date TEXT, overview TEXT)')
      await session.execute(
        'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
        ['recovered-claim', 'Recovered claim', '2026-03-01T12:00:00.000Z', null],
      )
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.getByRole('button', { name: 'Retry opening profile' }).click()
  await expect(page.getByText('Claim identifier: Recovered claim')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('stacks claim navigation on mobile and permits read-only keyboard selection without writes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Production preview does not expose source modules for test fixture seeding.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Read-only claims')
  const profileId = await seedProfileClaims(page, 'Read-only claims')
  const longIdentifier = 'LongClaimIdentifier'.repeat(12)
  await page.evaluate(async ({ id, identifier }) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      await session.execute('UPDATE claims SET identifier = ? WHERE id = ?', [identifier, 'claim-newer'])
    } finally {
      await session.dispose()
    }
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  }, { id: profileId, identifier: longIdentifier })
  await page.getByRole('button', { name: 'Read-only claims profile', exact: true }).click()
  await expect(page.getByRole('note')).toContainText('profile-content changes are blocked.')
  await expect(page.getByRole('button', { name: 'Delete claim', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Create claim', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Edit claim', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add dummy claims', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove dummy claims', exact: true })).toBeDisabled()
  const writeError = await page.evaluate(async (id) => {
    const modulePath = '/src/storage/developer-claims.ts'
    const tools: typeof import('../../src/storage/developer-claims') = await import(modulePath)
    try {
      await tools.changeDummyClaims(id, 'add')
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, profileId)
  expect(writeError).toContain('This profile is read-only.')

  const navigation = page.getByRole('navigation', { name: 'Claims', exact: true })
  const detail = page.getByRole('region', { name: / overview$/ })
  const desktopList = await navigation.boundingBox()
  const desktopDetail = await detail.boundingBox()
  expect(desktopList).not.toBeNull()
  expect(desktopDetail).not.toBeNull()
  expect(desktopDetail!.x).toBeGreaterThan(desktopList!.x + desktopList!.width)

  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('button', { name: longIdentifier, exact: true })).toBeHidden()
  await expect(navigation).toContainText(`Selected: ${longIdentifier}`)
  await navigation.getByRole('button', { name: 'Show claims', exact: true }).click()
  await detail.getByRole('button', { name: 'Show claim overview', exact: true }).click()
  await expect(page.getByRole('button', { name: longIdentifier, exact: true })).toBeVisible()
  await expect(detail).toContainText(`Claim identifier: ${longIdentifier}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const olderClaim = page.getByRole('button', { name: 'Claim 2025', exact: true })
  await olderClaim.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`profile=${profileId}&claim=claim-older$`))
  await expect(olderClaim).toHaveAttribute('aria-pressed', 'true')
  await expect(olderClaim).toBeFocused()
  await expect(detail).toContainText('Claim identifier: Claim 2025')
  await expect(detail.getByRole('button', { name: 'Show claim overview', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(navigation).toContainText('Selected: Claim 2025')
  await expect(page.getByRole('button', { name: 'Delete claim', exact: true })).toBeDisabled()
  const mobileList = await navigation.boundingBox()
  const mobileDetail = await detail.boundingBox()
  expect(mobileDetail!.y).toBeGreaterThan(mobileList!.y + mobileList!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
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
  await expect(page.getByRole('alert', { name: 'This profile could not be opened', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to profiles' }).click()
  await expect(page.getByRole('heading', { name: 'Your profiles' })).toBeVisible()
})

test('local developer controls add and remove persistent dummy claims without source-module access', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Preview dummy tools')
  await page.getByRole('button', { name: 'Preview dummy tools profile', exact: true }).click()
  const tools = page.getByRole('region', { name: 'Developer claim tools' })
  await expect(tools).toBeVisible()
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb).toHaveText('Profiles/Preview dummy tools/Claims')
  await expect(breadcrumb.getByRole('region', { name: 'Developer claim tools' })).toHaveCount(0)
  const emptyState = await page.getByRole('region', { name: 'No claims yet' }).boundingBox()
  const toolsPanel = await tools.boundingBox()
  expect(emptyState).not.toBeNull()
  expect(toolsPanel).not.toBeNull()
  expect(toolsPanel!.y).toBeGreaterThan(emptyState!.y + emptyState!.height)
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  const navigation = page.getByRole('navigation', { name: 'Claims', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(4)
  const weeks = page.getByRole('navigation', { name: 'Activity weeks', exact: true })
  await expect(weeks).toContainText('4 weeks, 2 empty')
  await expect(weeks.getByRole('button', { name: 'Week 2026-01-18 to 2026-01-24, 1 activity', exact: true })).toBeVisible()
  await weeks.getByRole('button', { name: 'Week 2025-12-28 to 2026-01-03, 4 activities', exact: true }).click()
  const activities = page.getByRole('list', { name: 'Activities in selected week', exact: true })
  await expect(activities.getByRole('listitem')).toHaveCount(4)
  await expect(activities).toContainText('WorkSource activity')
  await expect(activities).toContainText('Other activity')
  await expect(activities).toContainText('Employer contact')
  for (const buttons of [
    activities.getByRole('button'),
    weeks.getByRole('button', { name: /^Week / }),
  ]) {
    const offsets = await buttons.evaluateAll((elements) => elements.map((element) => {
      const label = element.querySelector('.mantine-Button-label')!
      return label.getBoundingClientRect().left - element.getBoundingClientRect().left
    }))
    expect(offsets.every((offset) => offset > 0 && offset < 30)).toBe(true)
  }
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  await expect(weeks).toContainText('4 weeks, 2 empty')
  await weeks.getByRole('button', { name: 'Week 2025-12-28 to 2026-01-03, 4 activities', exact: true }).click()
  await expect(activities.getByRole('listitem')).toHaveCount(4)
  await navigation.getByRole('button', { name: /^Dummy long identifier/ }).click()
  await expect(page.getByText('No activities yet.', { exact: false })).toBeVisible()
  await expect(weeks).toHaveCount(0)
  await navigation.locator('button[data-record-id="developer-dummy-claim-duplicate"]').click()
  await expect(weeks).toContainText('4 weeks, 2 empty')
  await page.reload()
  await expect(navigation.getByRole('button')).toHaveCount(4)
  await expect(weeks).toContainText('4 weeks, 2 empty')
  await tools.getByRole('button', { name: 'Remove dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toContainText('Other claims were left unchanged.')
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
})

test('developer dummy claims persist, remain profile-scoped, and can be removed without touching other claims', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This fixture uses Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Dummy tools one')
  await createProfile(page, 'Dummy tools two')
  const profileId = await seedProfileClaims(page, 'Dummy tools one')
  await page.getByRole('button', { name: 'Dummy tools one profile', exact: true }).click()
  const tools = page.getByRole('region', { name: 'Developer claim tools' })
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  const navigation = page.getByRole('navigation', { name: 'Claims', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(6)
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  await expect(navigation.getByRole('button')).toHaveCount(6)
  await navigation.locator('button[data-record-id="developer-dummy-claim-duplicate"]').click()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Dummy claim 2026 overview', exact: true })).toContainText('Record ID: developer-dummy-claim-duplicate')

  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await page.getByRole('button', { name: 'Dummy tools two profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  await expect(navigation.getByRole('button')).toHaveCount(4)

  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await page.getByRole('button', { name: 'Dummy tools one profile', exact: true }).click()
  await navigation.locator('button[data-record-id="developer-dummy-claim-duplicate"]').click()
  await tools.getByRole('button', { name: 'Remove dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toContainText('Other claims were left unchanged.')
  await expect(page).toHaveURL(new RegExp(`/claims\\?profile=${profileId}$`))
  await expect(navigation.getByRole('button')).toHaveCount(2)
  await expect(navigation.getByRole('button', { name: 'Claim 2026', exact: true })).toBeVisible()
  await page.reload()
  await expect(navigation.getByRole('button')).toHaveCount(2)
  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await page.getByRole('button', { name: 'Dummy tools two profile', exact: true }).click()
  await expect(navigation.getByRole('button')).toHaveCount(4)
})

test('developer dummy claim changes roll back on failure and allow retry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This fixture uses Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await createProfile(page, 'Dummy rollback')
  const profileId = await seedProfileClaims(page, 'Dummy rollback')
  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      await session.execute(`
        CREATE TRIGGER reject_dummy_insert AFTER INSERT ON activities
        WHEN NEW.id = 'dededede-0000-4000-8000-000000000102'
        BEGIN SELECT RAISE(FAIL, 'Dummy insertion failed'); END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.getByRole('button', { name: 'Dummy rollback profile', exact: true }).click()
  const tools = page.getByRole('region', { name: 'Developer claim tools' })
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('alert')).toContainText('Dummy insertion failed')
  await expect(page.getByRole('navigation', { name: 'Claims', exact: true }).getByRole('button')).toHaveCount(2)
  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      const rows = await session.execute('SELECT id FROM claims')
      if (rows.length !== 2) throw new Error('Failed insertion left partial dummy data.')
      const activities = await session.execute('SELECT id FROM activities')
      if (activities.length) throw new Error('Failed insertion left partial dummy activities.')
      await session.execute('DROP TRIGGER reject_dummy_insert')
    } finally {
      await session.dispose()
    }
  }, profileId)
  await tools.getByRole('button', { name: 'Add dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toHaveText('Dummy claims are ready.')
  await expect(tools.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Claims', exact: true }).getByRole('button')).toHaveCount(6)

  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      await session.execute(`
        CREATE TRIGGER reject_dummy_delete BEFORE DELETE ON claims
        WHEN OLD.id = 'developer-dummy-claim-duplicate'
        BEGIN SELECT RAISE(FAIL, 'Dummy removal failed'); END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await tools.getByRole('button', { name: 'Remove dummy claims', exact: true }).click()
  await expect(tools.getByRole('alert')).toContainText('Dummy removal failed')
  await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try {
      const rows = await session.execute('SELECT id FROM claims')
      if (rows.length !== 6) throw new Error('Failed removal deleted part of the dummy data.')
      const activities = await session.execute('SELECT id FROM activities')
      if (activities.length !== 15) throw new Error('Failed removal deleted part of the dummy activities.')
      await session.execute('DROP TRIGGER reject_dummy_delete')
    } finally {
      await session.dispose()
    }
  }, profileId)
  await tools.getByRole('button', { name: 'Remove dummy claims', exact: true }).click()
  await expect(tools.getByRole('status')).toContainText('Other claims were left unchanged.')
  await expect(page.getByRole('navigation', { name: 'Claims', exact: true }).getByRole('button')).toHaveCount(2)
  const remainingActivities = await page.evaluate(async (id) => {
    const modulePath = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(modulePath)
    const session = await storage.openProfile(id)
    try { return await session.execute('SELECT id FROM activities') } finally { await session.dispose() }
  }, profileId)
  expect(remainingActivities).toEqual([])
})
