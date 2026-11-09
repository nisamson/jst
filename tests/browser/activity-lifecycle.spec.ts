import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Profile label', exact: true }).fill(label)
  await page.locator('form').getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
  await expect(page.getByText(`Profile: ${label}`)).toBeVisible()
}

async function createClaim(page: Page, name: string) {
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await form.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill(name)
  await form.getByRole('button', { name: 'Create claim', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByText('No activities yet.', { exact: false })).toBeVisible()
}

async function addOther(page: Page, description: string) {
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await form.getByLabel(/^Activity date/).fill('2099-01-02')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill(description)
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
}

async function sql(page: Page, profileId: string, statement: string) {
  return page.evaluate(async ({ id, statement: query }) => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const session = await storage.openProfile(id)
    try { return await session.execute(query) } finally { await session.dispose() }
  }, { id: profileId, statement })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})

test('validates all kinds, warns without blocking, preserves identity through kind changes, and deletes only one duplicate', async ({ page }) => {
  await createProfile(page, 'Activity lifecycle')
  await createClaim(page, 'My activities')
  const activities = page.getByRole('region', { name: 'Job-search activities', exact: true })
  const detail = page.getByRole('region', { name: 'Activity details', exact: true })
  await activities.getByRole('button', { name: 'Add activity', exact: true }).click()
  let form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await expect(form.getByLabel(/^Activity date/)).toHaveAttribute('type', 'date')
  await form.getByLabel(/^Activity date/).fill('')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('valid activity date')
  await form.getByLabel(/^Activity date/).fill('2099-01-02')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('job title or reference')
  await form.getByRole('textbox', { name: 'Job title or reference', exact: true }).fill('  Engineer  ')
  await form.getByRole('textbox', { name: 'Employer name', exact: true }).fill("  Example ' employer  ")
  await form.getByRole('combobox', { name: 'Contact method', exact: true }).selectOption('other')
  await form.getByRole('combobox', { name: 'Contact type', exact: true }).selectOption('inquiry')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('other contact method')
  await form.getByRole('textbox', { name: 'Other contact method', exact: true }).fill('  Conference chat  ')
  await form.getByLabel('Employer city', { exact: true }).fill('Seattle')
  await form.getByLabel('Employer state', { exact: true }).fill('Washington')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('City and state alone are not enough')
  await form.getByLabel('Employer address', { exact: true }).fill('Main office')
  await form.getByLabel('Employer website or email', { exact: true }).fill('Flexible contact information')
  await form.getByLabel('Employer phone', { exact: true }).fill('Switchboard ext. 1')
  await expect(form.getByText(/This activity date is in the future/)).toBeVisible()
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(detail).toContainText("Example ' employer - Engineer")
  await expect(detail).toContainText('Conference chat')
  const recordId = (await detail.locator('p').filter({ hasText: /^Record ID:/ }).innerText()).replace('Record ID: ', '')
  const creationTime = await detail.locator('time').nth(1).getAttribute('dateTime')
  await expect(detail.locator('time').nth(2)).toHaveAttribute('dateTime', creationTime!)

  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('worksource_activity')
  await expect(form.getByRole('textbox', { name: 'Employer name', exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Describe the activity')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('  Workshop\nSecond line <plain text>  ')
  await form.getByLabel('WorkSource office name', { exact: true }).fill('Online office')
  await form.getByLabel('WorkSource city', { exact: true }).fill('Seattle')
  await form.getByLabel('WorkSource state', { exact: true }).fill('WA')
  await expect(form.getByText(/evidence may exist outside the app/)).toBeVisible()
  await form.getByLabel('Documentation description (optional)', { exact: true }).fill('Completion email')
  await expect(form.getByText(/evidence may exist outside the app/)).toHaveCount(0)
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(detail).toContainText('WorkSource office name: Online office')
  await expect(detail).toContainText('Completion email')
  await expect(detail).not.toContainText('Employer name:')
  await expect(detail).toContainText(`Record ID: ${recordId}`)
  await expect(detail.locator('time').nth(1)).toHaveAttribute('dateTime', creationTime!)
  expect(await detail.locator('time').nth(2).getAttribute('dateTime')).not.toBe(creationTime)
  await expect(detail.locator('plain')).toHaveCount(0)

  await page.reload()
  await activities.getByRole('button', { name: new RegExp(`record ${recordId}$`) }).click()
  await expect(detail).toContainText('Workshop\nSecond line <plain text>')
  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await expect(form.getByLabel('WorkSource city', { exact: true })).toHaveCount(0)
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Practice interview')
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(detail).not.toContainText('WorkSource office')
  await expect(detail).toContainText(`Record ID: ${recordId}`)
  await expect(detail).toContainText('Documentation description: Not provided')
  await addOther(page, 'Practice interview')
  const entries = activities.getByRole('listitem')
  await expect(entries).toHaveCount(2)
  await activities.getByRole('button', { name: new RegExp(`record ${recordId}$`) }).click()
  await detail.getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Discarded edit')
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(detail).not.toContainText('Discarded edit')
  await detail.getByRole('button', { name: 'Delete activity', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete activity?', exact: true })
  await expect(confirmation).toContainText('Practice interview')
  await expect(confirmation).toContainText('2099-01-02')
  await expect(confirmation).toContainText(recordId)
  await expect(confirmation).toContainText('There is no undo.')
  await expect(confirmation.getByRole('textbox')).toHaveCount(0)
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(entries).toHaveCount(2)
  await detail.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(entries).toHaveCount(1)
  await page.reload()
  await expect(entries).toHaveCount(1)
  await expect(activities.getByRole('button', { name: new RegExp(`record ${recordId}$`) })).toHaveCount(0)
})

test('keeps activities scoped to the claim/profile and viewable but not writable in read-only mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await createProfile(page, 'First activity profile')
  await createClaim(page, 'First claim')
  await addOther(page, 'First claim private notes')
  const originalUrl = page.url()
  await createClaim(page, 'Second claim')
  await expect(page.getByRole('region', { name: 'Job-search activities', exact: true })).not.toContainText('First claim private notes')
  await addOther(page, 'Second claim notes')
  await page.goto(originalUrl)
  const activities = page.getByRole('region', { name: 'Job-search activities', exact: true })
  await expect(activities).toContainText('First claim private notes')
  await expect(activities).not.toContainText('Second claim notes')
  await page.getByRole('button', { name: 'Switch profile', exact: true }).click()
  await createProfile(page, 'Second activity profile')
  await createClaim(page, 'First claim')
  await expect(activities).not.toContainText('First claim private notes')
  await addOther(page, 'Other profile notes')
  await page.goto(originalUrl)
  await expect(activities).toContainText('First claim private notes')
  await expect(activities).not.toContainText('Other profile notes')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await page.reload()
  await expect(activities).toContainText('Activities are read-only')
  await expect(activities.getByRole('button', { name: 'Add activity', exact: true })).toBeDisabled()
  await activities.getByRole('button', { name: /^First claim private notes,/ }).focus()
  await page.keyboard.press('Enter')
  const detail = page.getByRole('region', { name: 'Activity details', exact: true })
  await expect(detail).toContainText('First claim private notes')
  await expect(detail.getByRole('button', { name: 'Edit activity', exact: true })).toBeDisabled()
  await expect(detail.getByRole('button', { name: 'Delete activity', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('failed writes roll back, retain entries, and can be retried; access is rechecked on save/delete', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Failure injection uses Vite source modules.')
  await createProfile(page, 'Activity retry')
  await createClaim(page, 'Retry claim')
  const profileId = new URL(page.url()).searchParams.get('profile')!
  const claimId = new URL(page.url()).searchParams.get('claim')!
  await sql(page, profileId, `CREATE TRIGGER reject_activity AFTER INSERT ON activities
    BEGIN SELECT RAISE(FAIL, 'Simulated activity failure'); END`)
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  let form = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Retained entry')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Simulated activity failure')
  await expect(form.getByRole('textbox', { name: 'Activity description', exact: true })).toHaveValue('Retained entry')
  expect(await sql(page, profileId, 'SELECT id FROM activities')).toEqual([])
  await sql(page, profileId, 'DROP TRIGGER reject_activity')
  await form.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(form).toBeHidden()
  const [original] = await sql(page, profileId, 'SELECT * FROM activities')

  await page.getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await form.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('worksource_activity')
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Retried edit')
  await form.getByLabel('WorkSource city', { exact: true }).fill('Seattle')
  await sql(page, profileId, `CREATE TRIGGER reject_activity AFTER UPDATE ON activities
    BEGIN SELECT RAISE(FAIL, 'Simulated edit failure'); END`)
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Simulated edit failure')
  await expect(form.getByRole('textbox', { name: 'Activity description', exact: true })).toHaveValue('Retried edit')
  await expect(form.getByLabel('WorkSource city', { exact: true })).toHaveValue('Seattle')
  expect(await sql(page, profileId, 'SELECT * FROM activities')).toEqual([original])
  await sql(page, profileId, 'DROP TRIGGER reject_activity')
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form).toBeHidden()
  const edited = await sql(page, profileId, 'SELECT * FROM activities')
  expect(edited[0]?.id).toBe(original?.id)
  expect(edited[0]?.created_at).toBe(original?.created_at)
  expect(edited[0]?.kind).toBe('worksource_activity')
  await sql(page, profileId, `CREATE TRIGGER reject_activity AFTER DELETE ON activities
    BEGIN SELECT RAISE(FAIL, 'Simulated delete failure'); END`)
  await page.getByRole('button', { name: 'Delete activity', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete activity?', exact: true })
  await dialog.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Simulated delete failure')
  expect(await sql(page, profileId, 'SELECT * FROM activities')).toEqual(edited)
  await sql(page, profileId, 'DROP TRIGGER reject_activity')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Edit activity', exact: true }).click()
  form = page.getByRole('dialog', { name: 'Edit activity', exact: true })
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await form.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Blocked edit')
  await form.getByRole('button', { name: 'Save activity', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('This profile is read-only')
  await expect(form.getByRole('textbox', { name: 'Activity description', exact: true })).toHaveValue('Blocked edit')
  const blocked = await page.evaluate(async ({ profileId: profile, claimId: claim, id }) => {
    const path = '/src/storage/activities.ts'
    const storage: typeof import('../../src/storage/activities') = await import(path)
    const errors: string[] = []
    for (const operation of [
      () => storage.saveProfileActivity(profile, claim, { kind: 'other_activity', activity_date: '2026-01-01', activity_description: 'Blocked create' }),
      () => storage.deleteProfileActivity(profile, claim, id),
    ]) {
      try { await operation() } catch (error) { errors.push(String(error)) }
    }
    return errors
  }, { profileId, claimId, id: String(original!.id) })
  expect(blocked).toHaveLength(2)
  expect(blocked.every((error) => error.includes('read-only'))).toBe(true)
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete activity', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await sql(page, profileId, 'SELECT * FROM activities')).toEqual([])
})

test('service enforces ownership and atomic kind replacement and rejects invalid stored metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Direct storage checks use Vite source modules.')
  await createProfile(page, 'Activity boundaries')
  await createClaim(page, 'Boundary claim')
  const profileId = new URL(page.url()).searchParams.get('profile')!
  const claimId = new URL(page.url()).searchParams.get('claim')!
  const result = await page.evaluate(async ({ profileId: profile, claimId: claim }) => {
    const activitiesPath = '/src/storage/activities.ts'
    const profilesPath = '/src/storage/profiles.ts'
    const claimsPath = '/src/storage/claims.ts'
    const activities: typeof import('../../src/storage/activities') = await import(activitiesPath)
    const profiles: typeof import('../../src/storage/profiles') = await import(profilesPath)
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const session = await profiles.openProfile(profile)
    try {
      const input = {
        kind: 'employer_contact' as const, activity_date: '2024-02-29',
        job_title_or_reference: 'Engineer', employer_name: 'Example',
        employer_address: ' Main office ', contact_method: 'online' as const, contact_type: 'interview' as const,
      }
      const first = await activities.saveActivity(session.execute, claim, input)
      const second = await activities.saveActivity(session.execute, claim, input)
      const otherClaim = await claims.createClaim(session.execute, { identifier: 'Other claim' })
      const errors = []
      for (const operation of [
        () => activities.saveActivity(session.execute, otherClaim.id, input, first.id),
        () => activities.deleteActivity(session.execute, otherClaim.id, first.id),
        () => activities.saveActivity(session.execute, 'missing-claim', input),
      ]) {
        try { await operation() } catch (error) { errors.push(String(error)) }
      }
      const before = await activities.listActivities(session.execute, claim)
      const changed = await activities.saveActivity(session.execute, claim, {
        ...first, kind: 'worksource_activity', activity_description: ' Workshop ', documentation_description: ' Email ',
        worksource_office_name: ' Office ', worksource_city: ' Seattle ', worksource_state: ' WA ',
      }, first.id)
      await session.execute('UPDATE activities SET created_at = ? WHERE id = ?', ['2026-02-30T00:00:00.000Z', first.id])
      let metadataError = ''
      try { await activities.listActivities(session.execute, claim) } catch (error) { metadataError = String(error) }
      await session.execute('UPDATE activities SET created_at = ? WHERE id = ?', [first.created_at, first.id])
      await claims.deleteClaim(session.execute, claim)
      const remaining = await session.execute('SELECT id FROM activities')
      return { first, second, before, changed, errors, metadataError, remaining }
    } finally { await session.dispose() }
  }, { profileId, claimId })
  expect(result.first.id).not.toBe(result.second.id)
  expect(result.before).toHaveLength(2)
  expect(result.errors).toHaveLength(3)
  expect(result.changed.id).toBe(result.first.id)
  expect(result.changed.claim_id).toBe(claimId)
  expect(result.changed.created_at).toBe(result.first.created_at)
  expect(result.changed.employer_name).toBeNull()
  expect(result.changed.contact_method).toBeNull()
  expect(result.changed.employer_address).toBeNull()
  expect(result.changed.activity_description).toBe('Workshop')
  expect(result.changed.worksource_city).toBe('Seattle')
  expect(result.metadataError).toContain('invalid timestamp')
  expect(result.remaining).toEqual([])
})

test('load errors do not look empty and can be retried; legacy read-only claims need no activity table', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Corrupt and legacy fixtures use Vite source modules.')
  await createProfile(page, 'Activity loading')
  await createClaim(page, 'Loading claim')
  await addOther(page, 'Stored activity')
  const profileId = new URL(page.url()).searchParams.get('profile')!
  const original = await sql(page, profileId, 'SELECT * FROM activities')
  await sql(page, profileId, "UPDATE activities SET updated_at = 'not-a-timestamp'")
  await page.getByRole('button', { name: 'Reload activities', exact: true }).click()
  const activities = page.getByRole('region', { name: 'Job-search activities', exact: true })
  await expect(activities.getByRole('alert')).toContainText('invalid timestamp')
  await expect(activities).not.toContainText('No activities yet.')
  await expect(activities.getByRole('button', { name: 'Add activity', exact: true })).toBeDisabled()
  await sql(page, profileId, `UPDATE activities SET updated_at = '${original[0]!.updated_at}'`)
  await activities.getByRole('button', { name: 'Retry loading activities', exact: true }).click()
  await expect(activities).toContainText('Stored activity')
  await sql(page, profileId, 'DROP TABLE activities')
  await sql(page, profileId, 'ALTER TABLE claims DROP COLUMN overview')
  await sql(page, profileId, 'PRAGMA user_version = 3')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
  })
  await page.reload()
  await expect(activities).toContainText('No activities yet.')
  await expect(activities).toContainText('Activities are read-only')
  expect(await sql(page, profileId, 'PRAGMA user_version')).toEqual([{ user_version: 3 }])
  expect(await sql(page, profileId, "SELECT name FROM sqlite_schema WHERE name = 'activities'")).toEqual([])
})
