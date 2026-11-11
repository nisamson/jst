import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  const form = page.locator('form')
  await form.getByRole('textbox', { name: 'Profile label' }).fill(label)
  await form.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText(`Profile: ${label}`)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})

test('lays out claim choices above a full-width overview on desktop and stacks them on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await createProfile(page, 'Claim layout')
  const longName = `Long claim ${'x'.repeat(100)}`
  for (const name of ['First claim', 'Second claim', longName]) {
    await page.getByRole('button', { name: 'Create claim', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'Create claim', exact: true })
    await form.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill(name)
    await form.getByRole('button', { name: 'Create claim', exact: true }).click()
    await expect(form).toBeHidden()
  }
  const navigation = page.getByRole('navigation', { name: 'Claims', exact: true })
  const first = navigation.getByRole('button', { name: 'First claim', exact: true })
  const second = navigation.getByRole('button', { name: 'Second claim', exact: true })
  const longClaim = navigation.getByRole('button', { name: longName, exact: true })
  const longTitle = longClaim.getByText(longName, { exact: true })
  const overview = page.getByRole('region', { name: `${longName} overview`, exact: true })
  const boxes = await Promise.all([navigation.boundingBox(), overview.boundingBox(), first.boundingBox(), second.boundingBox(), longClaim.boundingBox()])
  const [navBox, overviewBox, firstBox, secondBox, longBox] = boxes
  if (!navBox || !overviewBox || !firstBox || !secondBox || !longBox) throw new Error('Claim layout was not measured.')
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(overviewBox.y)
  expect(overviewBox.width).toBeGreaterThan(1440 * 0.85)
  expect(firstBox.y).toBe(secondBox.y)
  expect(firstBox.x).not.toBe(secondBox.x)
  expect(longBox.height).toBeCloseTo(firstBox.height, 1)
  await expect(longClaim).toHaveAttribute('title', longName)
  await expect(longTitle).toHaveCSS('text-overflow', 'ellipsis')
  expect(await longTitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  await expect(overview).toContainText(longName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)

  await page.setViewportSize({ width: 320, height: 812 })
  await expect(first).toBeHidden()
  await navigation.getByRole('button', { name: 'Show claims', exact: true }).click()
  const mobileFirst = await first.boundingBox()
  const mobileSecond = await second.boundingBox()
  const mobileLong = await longClaim.boundingBox()
  if (!mobileFirst || !mobileSecond || !mobileLong) throw new Error('Mobile claim choices were not measured.')
  expect(mobileFirst.y).not.toBe(mobileSecond.y)
  expect(mobileLong.height).toBeCloseTo(mobileFirst.height, 1)
  expect(await longTitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'First claim overview', exact: true })).toBeVisible()
})

test('creates and edits claims with duplicate labels, stable identity, optional dates, and profile isolation', async ({ page }) => {
  await createProfile(page, 'Lifecycle one')
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a claim identifier.')
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill("  My ' claim  ")
  await expect(dialog.getByLabel('Claim start date (optional)', { exact: true })).toHaveAttribute('type', 'date')
  await dialog.getByLabel('Claim start date (optional)', { exact: true }).fill('2024-02-29')
  const originalOverview = "Initial notes\nSecond line with 'quotes' and <plain text>"
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill(`  ${originalOverview}  `)
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  const originalUrl = page.url()
  const originalId = new URL(originalUrl).searchParams.get('claim')
  expect(originalId).toMatch(/^[0-9a-f-]{36}$/)
  const detail = page.getByRole('region', { name: / overview$/ })
  await expect(detail).toContainText("Claim identifier: My ' claim")
  await expect(detail).toContainText('Claim start date: 2024-02-29')
  await expect(detail).toContainText(originalOverview)
  await expect(detail.locator('plain')).toHaveCount(0)
  const creationTime = await detail.locator('time').first().getAttribute('dateTime')

  await page.getByRole('button', { name: 'Edit claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit claim', exact: true })
  await expect(dialog.getByRole('textbox', { name: 'Claim identifier', exact: true })).toHaveValue("My ' claim")
  await expect(dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true })).toHaveValue(originalOverview)
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Changed claim')
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill('Updated notes\nStill multiline')
  await expect(dialog.getByLabel('Claim start date (optional)', { exact: true })).toHaveValue('2024-02-29')
  await dialog.getByLabel('Claim start date (optional)', { exact: true }).fill('2030-01-01')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(originalUrl)
  await expect(detail).toContainText('Claim identifier: Changed claim')
  await expect(detail.getByRole('heading', { name: 'Changed claim overview', exact: true })).toBeVisible()
  await expect(detail).toContainText('Claim start date: 2030-01-01')
  await expect(detail).toContainText('Updated notes\nStill multiline')
  await expect(detail.locator('time').first()).toHaveAttribute('dateTime', creationTime!)

  await page.getByRole('button', { name: 'Edit claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit claim', exact: true })
  await dialog.getByRole('button', { name: 'Clear start date', exact: true }).click()
  await expect(dialog.getByLabel('Claim start date (optional)', { exact: true })).toHaveValue('')
  await expect(dialog.getByLabel('Claim start date (optional)', { exact: true })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill(' \n ')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  await expect(detail).toContainText('Claim start date: Not provided')
  await expect(detail).toContainText('No overview provided.')
  await expect(detail.locator('time')).toHaveAttribute('dateTime', creationTime!)

  await page.getByRole('button', { name: 'Edit claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Discarded edit')
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill('Discarded notes')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(detail).toContainText('Claim identifier: Changed claim')
  await expect(detail).toContainText('No overview provided.')

  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Changed claim')
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  const secondId = new URL(page.url()).searchParams.get('claim')
  expect(secondId).not.toBe(originalId)
  const navigation = page.getByRole('navigation', { name: 'Claims', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await expect(dialog).toContainText('all its associated activities')
  await expect(dialog).toContainText(`Record ID: ${secondId}`)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(navigation.getByRole('button')).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Type claim name to confirm' }).fill('Changed claim')
  await dialog.getByRole('button', { name: 'Delete claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(navigation.getByRole('button')).toHaveCount(1)
  await expect(detail).toContainText(`Record ID: ${originalId}`)

  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await createProfile(page, 'Lifecycle two')
  await expect(page.getByRole('heading', { name: 'No claims yet' })).toBeVisible()
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Second profile claim')
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill('Second profile notes')
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(detail).toContainText('Second profile claim')
  await expect(detail).toContainText('Second profile notes')
  await expect(navigation.getByRole('button', { name: 'Changed claim', exact: true })).toHaveCount(0)
  await page.goto(originalUrl)
  await expect(detail).toContainText('Claim identifier: Changed claim')
  await expect(detail).not.toContainText('Second profile notes')
  await expect(navigation.getByRole('button')).toHaveCount(1)
})

test('failed create and edit retain entries for retry and recheck read-only access', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Failure injection uses Vite source modules.')
  await createProfile(page, 'Retry saves')
  const profileId = new URL(page.url()).searchParams.get('profile')!
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      await session.execute(`
        CREATE TRIGGER reject_claim_save AFTER INSERT ON claims
        BEGIN SELECT RAISE(FAIL, 'Simulated save failure'); END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Keep entries')
  await dialog.getByLabel('Claim start date (optional)', { exact: true }).fill('2026-01-01')
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill('Retain these notes')
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Simulated save failure')
  await expect(dialog.getByRole('textbox', { name: 'Claim identifier', exact: true })).toHaveValue('Keep entries')
  await expect(dialog.getByLabel('Claim start date (optional)', { exact: true })).toHaveValue('2026-01-01')
  await expect(dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true })).toHaveValue('Retain these notes')
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      const rows = await session.execute('SELECT id FROM claims')
      if (rows.length) throw new Error('Failed create left a record behind.')
      await session.execute('DROP TRIGGER reject_claim_save')
    } finally {
      await session.dispose()
    }
  }, profileId)
  await dialog.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  const claimId = new URL(page.url()).searchParams.get('claim')!
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      await session.execute(`
        CREATE TRIGGER reject_claim_save AFTER UPDATE ON claims
        BEGIN SELECT RAISE(FAIL, 'Simulated edit failure'); END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.getByRole('button', { name: 'Edit claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Retried edit')
  await dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true }).fill('Retried notes')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Simulated edit failure')
  await expect(dialog.getByRole('textbox', { name: 'Claim identifier', exact: true })).toHaveValue('Retried edit')
  await expect(dialog.getByRole('textbox', { name: 'Overview (optional)', exact: true })).toHaveValue('Retried notes')
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      const [row] = await session.execute('SELECT identifier, overview FROM claims')
      if (row?.identifier !== 'Keep entries') throw new Error('Failed edit changed the stored record.')
      if (row?.overview !== 'Retain these notes') throw new Error('Failed edit changed the stored overview.')
      await session.execute('DROP TRIGGER reject_claim_save')
    } finally {
      await session.dispose()
    }
  }, profileId)
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Claim identifier: Retried edit')).toBeVisible()
  await expect(page.getByText('Retried notes', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit claim', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Edit claim', exact: true })
  await dialog.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Blocked edit')
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('This profile is read-only')
  const result = await page.evaluate(async ({ id, recordId }) => {
    const path = '/src/storage/claims.ts'
    const claims: typeof import('../../src/storage/claims') = await import(path)
    const errors = []
    for (const operation of [
      () => claims.saveProfileClaim(id, { identifier: 'Blocked create' }),
      () => claims.deleteProfileClaim(id, recordId),
    ]) {
      try { await operation() } catch (error) { errors.push(String(error)) }
    }
    return errors
  }, { id: profileId, recordId: claimId })
  expect(result).toHaveLength(2)
  expect(result.every((message) => message.includes('read-only'))).toBe(true)
})

test('claim deletion cascades atomically and preserves other claims, activities, and profile data', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Activity fixtures use Vite source modules.')
  await createProfile(page, 'Cascade test')
  const profileId = new URL(page.url()).searchParams.get('profile')!
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      await session.saveSimulatedSyncState('Preserved account', '2026-01-01T00:00:00.000Z')
      for (const claimId of ['delete-claim', 'keep-claim']) {
        await session.execute(
          'INSERT INTO claims (id, identifier, created_at) VALUES (?, ?, ?)',
          [claimId, claimId, '2026-01-01T00:00:00.000Z'],
        )
        for (const suffix of ['a', 'b']) {
          await session.execute(
            `INSERT INTO activities (id, claim_id, activity_date, kind, created_at, updated_at, activity_description)
             VALUES (?, ?, '2026-01-01', 'other_activity', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Activity')`,
            [`${claimId}-${suffix}`, claimId],
          )
        }
      }
      await session.execute(`
        CREATE TRIGGER reject_cascade AFTER DELETE ON activities
        WHEN OLD.id = 'delete-claim-b'
        BEGIN SELECT RAISE(FAIL, 'Cascade failed'); END
      `)
    } finally {
      await session.dispose()
    }
  }, profileId)
  await page.goto(`/claims?profile=${profileId}&claim=delete-claim`)
  await page.getByRole('button', { name: 'Delete claim', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete claim?' })
  await expect(dialog).toContainText('all its associated activities')
  await dialog.getByRole('textbox', { name: 'Type claim name to confirm' }).fill('delete-claim')
  await dialog.getByRole('button', { name: 'Delete claim', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Cascade failed')
  await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      const claims = await session.execute('SELECT id FROM claims')
      const activities = await session.execute('SELECT id FROM activities')
      if (claims.length !== 2 || activities.length !== 4) throw new Error('Cascade failure left partial deletion.')
      await session.execute('DROP TRIGGER reject_cascade')
    } finally {
      await session.dispose()
    }
  }, profileId)
  await dialog.getByRole('button', { name: 'Delete claim', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Claim identifier: keep-claim')).toBeVisible()
  const remaining = await page.evaluate(async (id) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try {
      return {
        claims: await session.execute('SELECT id FROM claims'),
        activities: await session.execute('SELECT id FROM activities ORDER BY id'),
        sync: await session.execute('SELECT account_label FROM simulated_sync_setup'),
        profile: session.profile,
        violations: await session.execute('PRAGMA foreign_key_check'),
      }
    } finally {
      await session.dispose()
    }
  }, profileId)
  expect(remaining.claims).toEqual([{ id: 'keep-claim' }])
  expect(remaining.activities).toEqual([{ id: 'keep-claim-a' }, { id: 'keep-claim-b' }])
  expect(remaining.sync).toEqual([{ account_label: 'Preserved account' }])
  expect(remaining.profile.label).toBe('Cascade test')
  expect(remaining.violations).toEqual([])
})
