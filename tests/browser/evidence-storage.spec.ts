import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'SQLite fixtures use Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})

test('preserves v5 read-only activities, rolls back a failed v6 migration, and upgrades without losing descriptions', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const profilesPath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(profilesPath)
    const claimsPath = '/src/storage/claims.ts'
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const activitiesPath = '/src/storage/activities.ts'
    const activities: typeof import('../../src/storage/activities') = await import(activitiesPath)
    const profile = await profiles.createProfile({ label: 'Legacy evidence' })
    const session = await profiles.openProfile(profile.id)
    let claimId = ''
    let activityId = ''
    try {
      claimId = (await claims.createClaim(session.execute, { identifier: 'Keep legacy claim' })).id
      activityId = (await activities.saveActivity(session.execute, claimId, {
        kind: 'other_activity', activity_date: '2026-01-04', activity_description: 'Keep legacy activity',
        documentation_description: 'Plain text stays plain text',
      })).id
      await session.execute('DROP TABLE activity_files')
      await session.execute('DROP TABLE activity_links')
      await session.execute('PRAGMA user_version = 5')
    } finally { await session.dispose() }

    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    const legacy = await profiles.openProfile(profile.id)
    let readOnly
    try {
      readOnly = {
        mode: legacy.access.mode,
        version: await legacy.execute('PRAGMA user_version'),
        activities: await activities.listActivities(legacy.execute, claimId),
      }
    } finally { await legacy.dispose() }

    const localPath = '/src/storage/local-storage.ts'
    const local: typeof import('../../src/storage/local-storage') = await import(localPath)
    const raw = await local.initializeStorage()
    try {
      await raw.openDatabase(`/profile-${profile.id}.sqlite3`)
      await raw.execute('CREATE INDEX activity_files_owner ON profile_metadata(label)')
    } finally { await raw.dispose() }
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    let migrationFailed = false
    try { const opened = await profiles.openProfile(profile.id); await opened.dispose() } catch { migrationFailed = true }
    const inspection = await local.initializeStorage()
    let rollback
    try {
      await inspection.openDatabase(`/profile-${profile.id}.sqlite3`)
      rollback = {
        version: await inspection.execute('PRAGMA user_version'),
        tables: await inspection.execute("SELECT name FROM sqlite_schema WHERE name IN ('activity_links', 'activity_files')"),
        activities: await inspection.execute('SELECT id, documentation_description FROM activities'),
      }
      await inspection.execute('DROP INDEX activity_files_owner')
    } finally { await inspection.dispose() }
    const upgraded = await profiles.openProfile(profile.id)
    try {
      const version = await upgraded.execute('PRAGMA user_version')
      const saved = await activities.saveActivity(upgraded.execute, claimId, {
        kind: 'other_activity', activity_date: '2026-01-04', activity_description: 'Keep legacy activity',
        documentation_description: 'Plain text stays plain text',
      }, activityId, {
        links: [{ id: crypto.randomUUID(), label: '', url: 'https://example.test/receipt' }],
        files: [{ id: crypto.randomUUID(), name: 'receipt.bin', type: '', size: 2, description: '', bytes: new Uint8Array([0, 255]) }],
      })
      return { readOnly, migrationFailed, rollback, version, saved, profileId: profile.id, claimId, activityId }
    } finally { await upgraded.dispose() }
  })

  expect(result.readOnly.mode).toBe('read-only')
  expect(result.readOnly.version).toEqual([{ user_version: 5 }])
  expect(result.readOnly.activities[0].evidence).toEqual({ links: [], files: [] })
  expect(result.readOnly.activities[0].documentation_description).toBe('Plain text stays plain text')
  expect(result.migrationFailed).toBe(true)
  expect(result.rollback).toEqual({
    version: [{ user_version: 5 }], tables: [],
    activities: [{ id: result.activityId, documentation_description: 'Plain text stays plain text' }],
  })
  expect(result.version).toEqual([{ user_version: 6 }])
  expect(result.saved.id).toBe(result.activityId)
  expect(result.saved.evidence?.files).toHaveLength(1)
  await page.goto(`/claims?profile=${result.profileId}&claim=${result.claimId}`)
  await page.getByRole('list', { name: 'Activities in selected week', exact: true }).getByRole('button').click()
  await expect(page.getByRole('region', { name: 'Activity details', exact: true })).toContainText('Plain text stays plain text')
})

test('scopes evidence to its profile, claim, and activity and cascades only the deleted owner', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const profilesPath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(profilesPath)
    const claimsPath = '/src/storage/claims.ts'
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const activitiesPath = '/src/storage/activities.ts'
    const activities: typeof import('../../src/storage/activities') = await import(activitiesPath)
    const evidencePath = '/src/storage/evidence.ts'
    const evidence: typeof import('../../src/storage/evidence') = await import(evidencePath)
    const first = await profiles.createProfile({ label: 'First profile' })
    const second = await profiles.createProfile({ label: 'Second profile' })
    const session = await profiles.openProfile(first.id)
    const input = { kind: 'other_activity' as const, activity_date: '2026-01-04', activity_description: 'Owned activity' }
    const draft = () => ({
      links: [{ id: crypto.randomUUID(), label: 'Receipt', url: 'https://example.test/receipt' }],
      files: [{ id: crypto.randomUUID(), name: 'receipt.txt', type: 'text/plain', size: 2, description: input.activity_description, bytes: new Uint8Array([65, 66]) }],
    })
    let original
    let wrongClaim = false
    let wrongActivity = false
    let stolenRetention = false
    let afterActivity
    let afterClaim
    try {
      const one = await claims.createClaim(session.execute, { identifier: 'One' })
      const two = await claims.createClaim(session.execute, { identifier: 'Two' })
      const a = await activities.saveActivity(session.execute, one.id, input, undefined, draft())
      const b = await activities.saveActivity(session.execute, one.id, input, undefined, draft())
      const c = await activities.saveActivity(session.execute, two.id, input, undefined, draft())
      original = { claimId: one.id, activityId: a.id, file: a.evidence!.files[0] }
      try { await evidence.readEvidenceFile(session.execute, two.id, a.id, original.file.id) } catch { wrongClaim = true }
      try { await evidence.readEvidenceFile(session.execute, one.id, b.id, original.file.id) } catch { wrongActivity = true }
      try {
        await activities.saveActivity(session.execute, one.id, { ...input, activity_description: 'Must roll back' }, b.id, { links: [], files: [original.file] })
      } catch { stolenRetention = true }
      const unchanged = (await activities.listActivities(session.execute, one.id)).find((item) => item.id === b.id)
      if (unchanged?.activity_description !== input.activity_description || unchanged.evidence?.files[0].id === original.file.id) {
        throw new Error('Rejected ownership change did not roll back.')
      }
      await activities.deleteActivity(session.execute, one.id, a.id)
      afterActivity = {
        files: await session.execute('SELECT count(*) AS count FROM activity_files'),
        links: await session.execute('SELECT count(*) AS count FROM activity_links'),
        other: (await activities.listActivities(session.execute, two.id))[0].id === c.id,
      }
      await claims.deleteClaim(session.execute, one.id)
      afterClaim = {
        files: await session.execute('SELECT count(*) AS count FROM activity_files'),
        links: await session.execute('SELECT count(*) AS count FROM activity_links'),
        other: Array.from((await evidence.readEvidenceFile(session.execute, two.id, c.id, c.evidence!.files[0].id)).bytes),
      }
    } finally { await session.dispose() }
    let wrongProfile = false
    try { await evidence.loadProfileEvidenceFile(second.id, original.claimId, original.activityId, original.file.id) } catch { wrongProfile = true }
    await profiles.deleteProfile(first.id)
    const remaining = await profiles.listProfiles()
    const directory = await navigator.storage.getDirectory()
    let deletedDatabase = false
    try { await directory.getFileHandle(`profile-${first.id}.sqlite3`) } catch { deletedDatabase = true }
    return { wrongClaim, wrongActivity, wrongProfile, stolenRetention, afterActivity, afterClaim, deletedDatabase,
      remainingIds: remaining.profiles.map((profile) => profile.id), secondId: second.id }
  })

  expect(result.wrongClaim).toBe(true)
  expect(result.wrongActivity).toBe(true)
  expect(result.wrongProfile).toBe(true)
  expect(result.stolenRetention).toBe(true)
  expect(result.afterActivity).toEqual({ files: [{ count: 2 }], links: [{ count: 2 }], other: true })
  expect(result.afterClaim).toEqual({ files: [{ count: 1 }], links: [{ count: 1 }], other: [65, 66] })
  expect(result.deletedDatabase).toBe(true)
  expect(result.remainingIds).toEqual([result.secondId])
})
