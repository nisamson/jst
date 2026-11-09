import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'Schema fixtures use Vite source modules.')
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})

for (const version of [1, 2, 3]) {
  test(`migrates version ${version} transactionally while preserving existing records`, async ({ page }) => {
    const result = await page.evaluate(async (legacyVersion) => {
      const path = '/src/storage/profiles.ts'
      const storage: typeof import('../../src/storage/profiles') = await import(path)
      const profile = await storage.createProfile({ label: `Legacy v${legacyVersion}`, realName: 'Example log name' })
      const session = await storage.openProfile(profile.id)
      try {
        await session.execute('DROP TABLE activities')
        if (legacyVersion >= 2) {
          await session.execute('ALTER TABLE claims DROP COLUMN overview')
          await session.execute("INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES ('keep-claim', 'My claim', '2025-01-01T00:00:00.000Z', '2024-12-01')")
        } else {
          await session.execute('DROP TABLE claims')
        }
        if (legacyVersion === 3) {
          await session.saveSimulatedSyncState('Saved simulation', '2025-01-01T00:00:00.000Z')
        } else {
          await session.execute('DROP TABLE simulated_sync_setup')
        }
        await session.execute(`PRAGMA user_version = ${legacyVersion}`)
        await session.execute('CREATE INDEX activities_claim_date ON profile_metadata(label)')
      } finally {
        await session.dispose()
      }

      let failed = false
      try { await storage.openProfile(profile.id) } catch { failed = true }
      if (!failed) throw new Error('Expected migration index conflict.')

      const localPath = '/src/storage/local-storage.ts'
      const local: typeof import('../../src/storage/local-storage') = await import(localPath)
      const raw = await local.initializeStorage()
      let afterRollback
      try {
        await raw.openDatabase(`/profile-${profile.id}.sqlite3`)
        afterRollback = {
          version: await raw.execute('PRAGMA user_version'),
          tables: await raw.execute("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"),
          profile: await raw.execute('SELECT profile_id, label, real_name, created_at FROM profile_metadata'),
        }
        await raw.execute('DROP INDEX activities_claim_date')
      } finally {
        await raw.dispose()
      }

      if (legacyVersion === 3) {
        Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
      }
      const migrated = await storage.openProfile(profile.id)
      try {
        return {
          profile,
          afterRollback,
          access: migrated.access,
          metadata: migrated.profile,
          version: await migrated.execute('PRAGMA user_version'),
          foreignKeys: await migrated.execute('PRAGMA foreign_keys'),
          claims: await migrated.execute('SELECT * FROM claims'),
          sync: await migrated.execute('SELECT account_label FROM simulated_sync_setup'),
          activities: await migrated.execute('SELECT * FROM activities'),
          index: await migrated.execute("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'activities_claim_date'"),
        }
      } finally {
        await migrated.dispose()
      }
    }, version)

    expect(result.afterRollback.version).toEqual([{ user_version: version }])
    expect(result.afterRollback.tables).not.toContainEqual({ name: 'activities' })
    if (version === 1) expect(result.afterRollback.tables).not.toContainEqual({ name: 'claims' })
    if (version < 3) expect(result.afterRollback.tables).not.toContainEqual({ name: 'simulated_sync_setup' })
    expect(result.afterRollback.profile).toEqual([{
      profile_id: result.profile.id,
      label: `Legacy v${version}`,
      real_name: 'Example log name',
      created_at: result.profile.createdAt,
    }])
    expect(result.metadata).toEqual(result.profile)
    expect(result.version).toEqual([{ user_version: 5 }])
    expect(result.foreignKeys).toEqual([{ foreign_keys: 1 }])
    expect(result.activities).toEqual([])
    expect(result.index).toEqual([{ name: 'activities_claim_date' }])
    expect(result.claims).toEqual(version >= 2
      ? [{ id: 'keep-claim', identifier: 'My claim', created_at: '2025-01-01T00:00:00.000Z', claim_start_date: '2024-12-01', overview: null }]
      : [])
    expect(result.sync).toEqual(version === 3 ? [{ account_label: 'Saved simulation' }] : [])
    if (version === 3) expect(result.access).toEqual({ mode: 'read-write', persistence: 'denied', syncConnected: true })
  })
}

test('reads an unprotected version-three profile without migrating or allowing writes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const profile = await storage.createProfile({ label: 'Old read-only profile' })
    const session = await storage.openProfile(profile.id)
    await session.execute('DROP TABLE activities')
    await session.execute('ALTER TABLE claims DROP COLUMN overview')
    await session.execute('PRAGMA user_version = 3')
    await session.dispose()
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    const opened = await storage.openProfile(profile.id)
    try {
      let writeError = ''
      try { await opened.execute("INSERT INTO claims (id, identifier, created_at) VALUES ('x', 'x', 'x')") } catch (error) { writeError = String(error) }
      return {
        mode: opened.access.mode,
        version: await opened.execute('PRAGMA user_version'),
        activities: await opened.execute("SELECT name FROM sqlite_schema WHERE name = 'activities'"),
        writeError,
      }
    } finally {
      await opened.dispose()
    }
  })

  expect(result.mode).toBe('read-only')
  expect(result.version).toEqual([{ user_version: 3 }])
  expect(result.activities).toEqual([])
  expect(result.writeError).toMatch(/readonly/i)
})

test('reads version-four claims without migration and preserves their records when upgrading for writes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const profile = await storage.createProfile({ label: 'Version four overview migration' })
    const session = await storage.openProfile(profile.id)
    try {
      await session.execute('ALTER TABLE claims DROP COLUMN overview')
      await session.execute("INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES ('keep', 'Keep claim', '2026-01-01T00:00:00.000Z', '2025-12-01')")
      await session.execute(`
        INSERT INTO activities (id, claim_id, activity_date, kind, created_at, updated_at, activity_description)
        VALUES ('activity', 'keep', '2026-01-01', 'other_activity', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'Keep activity')
      `)
      await session.execute('PRAGMA user_version = 4')
    } finally {
      await session.dispose()
    }

    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    const legacy = await storage.openProfile(profile.id)
    let legacyClaims
    let legacyVersion
    try {
      const claimsPath = '/src/storage/claims.ts'
      const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
      legacyClaims = await claims.listClaims(legacy.execute)
      legacyVersion = await legacy.execute('PRAGMA user_version')
    } finally {
      await legacy.dispose()
    }

    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    const upgraded = await storage.openProfile(profile.id)
    try {
      return {
        profileId: profile.id,
        legacyClaims,
        legacyVersion,
        profile: upgraded.profile,
        claims: await upgraded.execute('SELECT * FROM claims'),
        activities: await upgraded.execute('SELECT id, claim_id, activity_description FROM activities'),
        version: await upgraded.execute('PRAGMA user_version'),
      }
    } finally {
      await upgraded.dispose()
    }
  })
  expect(result.legacyClaims).toEqual([{
    id: 'keep', identifier: 'Keep claim', createdAt: '2026-01-01T00:00:00.000Z', claimStartDate: '2025-12-01',
  }])
  expect(result.legacyVersion).toEqual([{ user_version: 4 }])
  expect(result.claims).toEqual([{
    id: 'keep', identifier: 'Keep claim', created_at: '2026-01-01T00:00:00.000Z', claim_start_date: '2025-12-01', overview: null,
  }])
  expect(result.activities).toEqual([{ id: 'activity', claim_id: 'keep', activity_description: 'Keep activity' }])
  expect(result.version).toEqual([{ user_version: 5 }])
  expect(result.profile.label).toBe('Version four overview migration')
  await page.goto(`/claims?profile=${result.profileId}&claim=keep`)
  await expect(page.getByRole('region', { name: 'Keep claim overview', exact: true })).toContainText('No overview provided.')
})

test('new schema enforces activity ownership, enums, conditional fields, and nonblank required text', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/storage/profiles.ts'
    const storage: typeof import('../../src/storage/profiles') = await import(path)
    const profile = await storage.createProfile({ label: 'Schema constraints' })
    const session = await storage.openProfile(profile.id)
    try {
      await session.execute("INSERT INTO claims (id, identifier, created_at) VALUES ('owner', 'Owner', '2026-01-01T00:00:00.000Z')")
      const cases = [
        { claim_id: 'owner', kind: 'other_activity', activity_description: 'Other activity' },
        { claim_id: 'owner', kind: 'worksource_activity', activity_description: 'Workshop', worksource_city: 'Seattle' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'email', contact_type: 'inquiry', employer_website_or_email: 'example.test' },
        { claim_id: 'missing', kind: 'other_activity', activity_description: 'Orphan' },
        { claim_id: 'owner', kind: 'unsupported', activity_description: 'Invalid kind' },
        { claim_id: 'owner', kind: 'other_activity', activity_description: '   ' },
        { claim_id: 'owner', kind: 'worksource_activity' },
        { claim_id: 'owner', kind: 'other_activity', activity_description: 'Other', employer_name: 'Inapplicable' },
        { claim_id: 'owner', kind: 'other_activity', activity_description: 'Other', worksource_city: 'Inapplicable' },
        { claim_id: 'owner', kind: 'employer_contact' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'other', contact_type: 'interview', employer_phone: '123' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'fax', contact_type: 'interview', employer_phone: '123' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'phone', contact_type: 'email', employer_phone: '123' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'phone', contact_type: 'inquiry', employer_city: 'City only' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'phone', contact_type: 'inquiry', employer_phone: '123', activity_description: 'Inapplicable' },
        { claim_id: 'owner', kind: 'employer_contact', job_title_or_reference: 'Developer', employer_name: 'Example', contact_method: 'phone', contact_method_other: 'Inapplicable', contact_type: 'inquiry', employer_phone: '123' },
      ]
      const accepted = []
      for (const [index, fields] of cases.entries()) {
        const values = {
          id: `record-${index}`,
          activity_date: '2026-01-01',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          ...fields,
        }
        const columns = Object.keys(values)
        try {
          await session.execute(
            `INSERT INTO activities (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
            Object.values(values),
          )
          accepted.push(index)
        } catch { /* Invalid fixture rows must fail SQLite constraints. */ }
      }
      return {
        accepted,
        version: await session.execute('PRAGMA user_version'),
        foreignKeys: await session.execute('PRAGMA foreign_keys'),
      }
    } finally {
      await session.dispose()
    }
  })
  expect(result.accepted).toEqual([0, 1, 2])
  expect(result.version).toEqual([{ user_version: 5 }])
  expect(result.foreignKeys).toEqual([{ foreign_keys: 1 }])
})
