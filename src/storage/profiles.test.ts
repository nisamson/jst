import { beforeEach, expect, it, vi } from 'vitest'
import type { SqlValue } from '@sqlite.org/sqlite-wasm'
import { createProfileRepository } from './profiles'
import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'

interface FakeDatabase {
  version: number
  hasTable: boolean
  hasClaimsTable: boolean
  hasSimulatedSyncTable: boolean
  queryOnly: boolean
  syncState?: { provider_id: string; account_label: string; connected_at: string }
  profile?: {
    profile_id: string
    label: string
    real_name: string | null
    created_at: string
  }
}

const profileIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
]

let databases: Map<string, FakeDatabase>
let activeDatabase: FakeDatabase | undefined
let failInsert: boolean
let failRemove: boolean
let storage: StorageSession

function row(values: Record<string, SqlValue>): SqlRow {
  return values
}

function createHarness(ids = profileIds, persistence: 'granted' | 'denied' | 'unavailable' | 'error' | 'unknown' = 'granted') {
  const initializeStorage = vi.fn(async () => storage)
  const getDirectory = vi.fn(async () => ({
    async *entries(): AsyncGenerator<[string, { kind: string }]> {
      for (const filename of databases.keys()) {
        yield [filename.slice(1), { kind: 'file' }]
      }
      yield ['not-a-profile.sqlite3', { kind: 'file' }]
      yield ['profile-33333333-3333-4333-8333-333333333333.sqlite3', { kind: 'directory' }]
    },
    async removeEntry(name: string) {
      if (failRemove) throw new Error('The profile database is in use.')
      if (!databases.delete(`/${name}`)) throw new Error('Database does not exist.')
    },
  }))
  let nextId = 0
  const repository = createProfileRepository({
    initializeStorage,
    getDirectory,
    createId: () => ids[nextId++],
    getPersistenceStatus: async () => persistence,
  })
  return { repository, initializeStorage, getDirectory }
}

beforeEach(() => {
  databases = new Map()
  activeDatabase = undefined
  failInsert = false
  failRemove = false
  storage = {
    importProfile: vi.fn().mockResolvedValue({ label: 'Backup (restored copy)', real_name: 'Alex Example' }),
    exportProfile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    async openDatabase(filename, options) {
      let database = databases.get(filename)
      if (!database && options?.create) {
        database = {
          version: 0,
          hasTable: false,
          hasClaimsTable: false,
          hasSimulatedSyncTable: false,
          queryOnly: false,
        }
        databases.set(filename, database)
      }
      if (!database) throw new Error('Database does not exist.')
      if (activeDatabase) throw new Error('Another database is open.')
      activeDatabase = database
    },
    async execute(sql, bind): Promise<SqlRow[]> {
      if (!activeDatabase) throw new Error('No database is open.')
      const statement = sql.replaceAll(/\s+/g, ' ').trim()
      if (statement === 'PRAGMA foreign_keys = ON') return []
      if (statement === 'PRAGMA foreign_keys') return [row({ foreign_keys: 1 })]
      if (statement === 'ALTER TABLE claims ADD COLUMN overview TEXT') return []
      if (statement === 'PRAGMA user_version = 6') {
        activeDatabase.version = 6
        return []
      }
      if (statement.startsWith('CREATE TABLE activity_') || statement.startsWith('CREATE INDEX activity_')) return []
      if (statement === 'PRAGMA user_version = 5') {
        activeDatabase.version = 5
        return []
      }
      if (statement.startsWith('CREATE TABLE activities') || statement.startsWith('CREATE INDEX activities_claim_date')) return []
      if (statement === 'PRAGMA user_version = 4') {
        activeDatabase.version = 4
        return []
      }
      if (statement === 'PRAGMA query_only = ON') {
        activeDatabase.queryOnly = true
        return []
      }
      if (statement === 'PRAGMA query_only = OFF') {
        activeDatabase.queryOnly = false
        return []
      }
      if (activeDatabase.queryOnly && /^(BEGIN|COMMIT|ROLLBACK|CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|PRAGMA user_version =)/i.test(statement)) {
        throw new Error('attempt to write a readonly database')
      }
      if (statement === 'BEGIN IMMEDIATE' || statement === 'COMMIT' || statement === 'ROLLBACK') return []
      if (statement === 'PRAGMA user_version') return [row({ user_version: activeDatabase.version })]
      if (statement === 'PRAGMA user_version = 2') {
        activeDatabase.version = 2
        return []
      }
      if (statement === 'PRAGMA user_version = 3') {
        activeDatabase.version = 3
        return []
      }
      if (statement === 'PRAGMA user_version = 1') {
        activeDatabase.version = 1
        return []
      }
      if (statement.startsWith('SELECT provider_id, account_label, connected_at FROM simulated_sync_setup')) {
        return activeDatabase.syncState ? [row(activeDatabase.syncState)] : []
      }
      if (statement.startsWith('INSERT INTO simulated_sync_setup')) {
        const [accountLabel, connectedAt] = Array.isArray(bind) ? bind : []
        activeDatabase.syncState = {
          provider_id: 'dummy',
          account_label: String(accountLabel),
          connected_at: String(connectedAt),
        }
        return []
      }
      if (statement.startsWith('INSERT INTO claims')) return []
      if (statement.startsWith('SELECT name FROM sqlite_schema')) {
        return activeDatabase.hasTable ? [row({ name: 'profile_metadata' })] : []
      }
      if (statement.startsWith('CREATE TABLE profile_metadata')) {
        activeDatabase.hasTable = true
        return []
      }
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS claims')) {
        activeDatabase.hasClaimsTable = true
        return []
      }
      if (statement.startsWith('CREATE TABLE IF NOT EXISTS simulated_sync_setup')) {
        activeDatabase.hasSimulatedSyncTable = true
        return []
      }
      if (statement.startsWith('INSERT INTO profile_metadata')) {
        if (failInsert) throw new Error('disk is full')
        const [id, label, realName, createdAt] = Array.isArray(bind) ? bind : []
        activeDatabase.profile = {
          profile_id: String(id),
          label: String(label),
          real_name: typeof realName === 'string' ? realName : null,
          created_at: String(createdAt),
        }
        return []
      }
      if (statement.startsWith('SELECT profile_id, label, real_name, created_at')) {
        return activeDatabase.profile ? [row(activeDatabase.profile)] : []
      }
      if (statement === 'SELECT profile_id FROM profile_metadata') {
        return activeDatabase.profile ? [row({ profile_id: activeDatabase.profile.profile_id })] : []
      }
      throw new Error(`Unexpected SQL in test: ${statement}`)
    },
    async closeDatabase() {
      activeDatabase = undefined
    },
    async dispose() {
      activeDatabase = undefined
    },
  }
})

it('creates, lists, and opens separate profiles with normalized metadata', async () => {
  const { repository, initializeStorage } = createHarness()
  const first = await repository.createProfile({ label: '  My profile  ', realName: '  Alex Example ' })
  const second = await repository.createProfile({ label: 'Other profile' })

  expect(first).toMatchObject({ id: profileIds[0], label: 'My profile', realName: 'Alex Example' })
  expect(second).toMatchObject({ id: profileIds[1], label: 'Other profile' })
  expect(second).not.toHaveProperty('realName')

  const listing = await repository.listProfiles()
  expect(listing).toEqual({
    profiles: [first, second], errors: [],
    syncStatuses: { [first.id]: { state: 'unconfigured' }, [second.id]: { state: 'unconfigured' } },
  })

  const opened = await repository.openProfile(first.id)
  expect(opened.profile).toEqual(first)
  expect(databases.get(`/profile-${first.id}.sqlite3`)?.version).toBe(6)
  expect(databases.get(`/profile-${first.id}.sqlite3`)?.hasClaimsTable).toBe(true)
  expect(databases.get(`/profile-${first.id}.sqlite3`)?.hasSimulatedSyncTable).toBe(true)
  await opened.dispose()
  expect(initializeStorage).toHaveBeenCalledTimes(4)
})

it('restores into a new profile and leaves the original profile and sync setup unchanged', async () => {
  const { repository } = createHarness()
  const original = await repository.createProfile({ label: 'Original' })
  const source = databases.get(`/profile-${original.id}.sqlite3`)!
  const syncState = { provider_id: 'dummy', account_label: 'Original account', connected_at: '2026-01-01' }
  source.syncState = syncState
  const bytes = new Uint8Array([1, 2, 3])
  const restored = await repository.importProfile(bytes)
  expect(restored).toMatchObject({ id: profileIds[1], label: 'Backup (restored copy)', realName: 'Alex Example' })
  expect(storage.importProfile).toHaveBeenCalledWith(bytes)
  expect(source.profile?.label).toBe('Original')
  expect(source.syncState).toEqual(syncState)
  const session = await repository.openProfile(restored.id)
  expect(session.access.syncConnected).toBe(false)
  await session.dispose()
})

it('removes only the newly created profile on restore failure and supports retry', async () => {
  const { repository } = createHarness([profileIds[0], profileIds[1], '33333333-3333-4333-8333-333333333333'])
  const original = await repository.createProfile({ label: 'Original' })
  vi.mocked(storage.importProfile).mockRejectedValueOnce(new Error('Invalid backup'))
  await expect(repository.importProfile(new Uint8Array([1]))).rejects.toThrow('Invalid backup')
  expect([...databases.keys()]).toEqual([`/profile-${original.id}.sqlite3`])
  const restored = await repository.importProfile(new Uint8Array([2]))
  expect(restored.id).not.toBe(original.id)
  expect((await repository.listProfiles()).profiles).toHaveLength(2)
})

it('does not import or remove an existing profile when generated IDs collide', async () => {
  const { repository } = createHarness([profileIds[0], profileIds[0]])
  const original = await repository.createProfile({ label: 'Original' })
  await expect(repository.importProfile(new Uint8Array([1]))).rejects.toThrow('already exists')
  expect(storage.importProfile).not.toHaveBeenCalled()
  expect(databases.get(`/profile-${original.id}.sqlite3`)?.profile?.label).toBe('Original')
})

it('reports failed cleanup without deleting an existing profile', async () => {
  const { repository } = createHarness()
  const original = await repository.createProfile({ label: 'Original' })
  failRemove = true
  vi.mocked(storage.importProfile).mockRejectedValueOnce(new Error('Invalid backup'))
  await expect(repository.importProfile(new Uint8Array([1]))).rejects.toThrow('could not be removed')
  expect(databases.get(`/profile-${original.id}.sqlite3`)?.profile?.label).toBe('Original')
})

it('rejects empty labels before initializing storage', async () => {
  const { repository, initializeStorage } = createHarness()
  await expect(repository.createProfile({ label: '  ' })).rejects.toThrow(/profile label/)
  expect(initializeStorage).not.toHaveBeenCalled()
  expect(databases.size).toBe(0)
})

it('exports the selected profile without migration or requiring write access', async () => {
  const { repository } = createHarness(profileIds, 'denied')
  const profile = await repository.createProfile({ label: 'Legacy profile' })
  const database = databases.get(`/profile-${profile.id}.sqlite3`)
  if (!database) throw new Error('Test profile is missing.')
  database.version = 5
  const close = vi.spyOn(storage, 'dispose')
  expect(await repository.exportProfile(profile.id)).toEqual(new Uint8Array([1, 2, 3]))
  expect(database.version).toBe(5)
  expect(database.queryOnly).toBe(true)
  expect(storage.exportProfile).toHaveBeenCalledWith(profile.id)
  expect(close).toHaveBeenCalledOnce()

  vi.mocked(storage.exportProfile).mockRejectedValueOnce(new Error('Snapshot failed'))
  await expect(repository.exportProfile(profile.id)).rejects.toThrow('Snapshot failed')
  expect(close).toHaveBeenCalledTimes(2)
  expect(database.version).toBe(5)
  await expect(repository.exportProfile('../invalid')).rejects.toThrow(/invalid/)
})

it('does not overwrite an existing profile when an ID collides', async () => {
  const { repository } = createHarness([profileIds[0], profileIds[0]])
  const existing = await repository.createProfile({ label: 'Keep this profile' })
  await expect(repository.createProfile({ label: 'Replacement' })).rejects.toThrow(/already exists/)

  const listing = await repository.listProfiles()
  expect(listing).toEqual({ profiles: [existing], errors: [], syncStatuses: { [existing.id]: { state: 'unconfigured' } } })
})

it('keeps profiles visible when their sync setup metadata is invalid', async () => {
  const { repository } = createHarness()
  const profile = await repository.createProfile({ label: 'Keep profile' })
  const database = databases.get(`/profile-${profile.id}.sqlite3`)
  if (!database) throw new Error('Test profile is missing.')
  database.syncState = { provider_id: 'invalid', account_label: 'Account', connected_at: '2026-01-01' }
  const listing = await repository.listProfiles()
  expect(listing.profiles).toEqual([profile])
  expect(listing.errors).toEqual([])
  expect(listing.syncStatuses[profile.id]).toEqual({
    state: 'error', message: 'The saved sync setup state is invalid.',
  })
})

it('deletes only the profile matching the validated ID', async () => {
  const { repository } = createHarness()
  const first = await repository.createProfile({ label: 'Duplicate label' })
  const second = await repository.createProfile({ label: 'Duplicate label' })
  const secondDatabase = databases.get(`/profile-${second.id}.sqlite3`)

  await repository.deleteProfile(first.id)

  expect(databases.has(`/profile-${first.id}.sqlite3`)).toBe(false)
  expect(databases.get(`/profile-${second.id}.sqlite3`)).toBe(secondDatabase)
  expect(await repository.listProfiles()).toEqual({ profiles: [second], errors: [], syncStatuses: { [second.id]: { state: 'unconfigured' } } })
  await expect(repository.openProfile(first.id)).rejects.toThrow(/does not exist/)
  await expect(repository.deleteProfile('../other.sqlite3')).rejects.toThrow(/invalid/)
})

it('surfaces profile deletion failures without removing the profile', async () => {
  const { repository } = createHarness()
  const profile = await repository.createProfile({ label: 'Keep on failure' })
  failRemove = true

  await expect(repository.deleteProfile(profile.id)).rejects.toThrow('The profile database is in use.')
  expect(await repository.listProfiles()).toEqual({ profiles: [profile], errors: [], syncStatuses: { [profile.id]: { state: 'unconfigured' } } })
})

it('reports failed creation and does not expose an incomplete database as a profile', async () => {
  const { repository } = createHarness()
  const original = await repository.createProfile({ label: 'Existing profile' })
  failInsert = true
  await expect(repository.createProfile({ label: 'Incomplete profile' })).rejects.toThrow('disk is full')

  const listing = await repository.listProfiles()
  expect(listing.profiles).toEqual([original])
  expect(listing.errors).toEqual([{
    id: profileIds[1],
    message: 'Unsupported or incomplete profile database version for profile 22222222-2222-4222-8222-222222222222.',
  }])
})

it('surfaces missing and unsupported profiles instead of creating or resetting them', async () => {
  const { repository } = createHarness()
  await expect(repository.openProfile('33333333-3333-4333-8333-333333333333')).rejects.toThrow(/does not exist/)
  await expect(repository.openProfile('invalid-id')).rejects.toThrow(/invalid/)

  const versionedDatabase: FakeDatabase = {
    version: 7,
    hasTable: true,
    hasClaimsTable: false,
    hasSimulatedSyncTable: false,
    queryOnly: false,
    profile: {
      profile_id: profileIds[0],
      label: 'Preserve this profile',
      real_name: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
  databases.set(`/profile-${profileIds[0]}.sqlite3`, versionedDatabase)
  const listing = await repository.listProfiles()
  expect(listing.profiles).toEqual([])
  expect(listing.errors).toHaveLength(1)
  expect(listing.errors[0].message).toMatch(/unsupported or incomplete/i)
  expect(versionedDatabase.version).toBe(7)
  expect(versionedDatabase.profile?.label).toBe('Preserve this profile')
})

it('migrates a version-one profile without changing its metadata', async () => {
  const { repository } = createHarness()
  const legacy: FakeDatabase = {
    version: 1,
    hasTable: true,
    hasClaimsTable: false,
    hasSimulatedSyncTable: false,
    queryOnly: false,
    profile: {
      profile_id: profileIds[0],
      label: 'Existing profile',
      real_name: 'Alex Example',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
  databases.set(`/profile-${profileIds[0]}.sqlite3`, legacy)

  const opened = await repository.openProfile(profileIds[0])

  expect(opened.profile).toEqual({
    id: profileIds[0],
    label: 'Existing profile',
    realName: 'Alex Example',
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  expect(legacy.version).toBe(6)
  expect(legacy.hasClaimsTable).toBe(true)
  expect(legacy.hasSimulatedSyncTable).toBe(true)
  await opened.dispose()
})

it('migrates a version-two profile by adding simulated setup state', async () => {
  const { repository } = createHarness()
  const existing: FakeDatabase = {
    version: 2,
    hasTable: true,
    hasClaimsTable: true,
    hasSimulatedSyncTable: false,
    queryOnly: false,
    profile: {
      profile_id: profileIds[0],
      label: 'Existing profile',
      real_name: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
  databases.set(`/profile-${profileIds[0]}.sqlite3`, existing)

  const opened = await repository.openProfile(profileIds[0])

  expect(opened.profile.label).toBe('Existing profile')
  expect(existing.version).toBe(6)
  expect(existing.hasSimulatedSyncTable).toBe(true)
  await opened.dispose()
})

it('keeps unverified profiles readable while blocking database writes', async () => {
  const { repository } = createHarness(profileIds, 'denied')
  const profile = await repository.createProfile({ label: 'Read-only profile' })

  const opened = await repository.openProfile(profile.id)
  expect(opened.access).toEqual({
    mode: 'read-only',
    persistence: 'denied',
    syncConnected: false,
  })
  expect(await opened.execute('SELECT profile_id FROM profile_metadata')).toEqual([
    row({ profile_id: profile.id }),
  ])
  await expect(opened.execute('INSERT INTO claims VALUES (?, ?, ?, ?)')).rejects.toThrow(/readonly/i)
  await expect(opened.execute('PRAGMA user_version = 1')).rejects.toThrow(/readonly/i)
  await opened.dispose()
})

it('allows writes when a simulated connection is saved for the profile', async () => {
  const { repository } = createHarness(profileIds, 'denied')
  const profile = await repository.createProfile({ label: 'Connected profile' })
  const database = databases.get(`/profile-${profile.id}.sqlite3`)
  if (!database) throw new Error('Test profile database was not created.')
  database.syncState = {
    provider_id: 'dummy',
    account_label: 'Simulated account',
    connected_at: '2026-01-01T00:00:00.000Z',
  }

  const opened = await repository.openProfile(profile.id)
  expect(opened.access).toEqual({
    mode: 'read-write',
    persistence: 'denied',
    syncConnected: true,
  })
  await opened.execute('INSERT INTO claims VALUES (?, ?, ?, ?)')
  await opened.dispose()
})

it('blocks profile operations while read-only setup temporarily enables its metadata write', async () => {
  const { repository } = createHarness(profileIds, 'denied')
  const profile = await repository.createProfile({ label: 'Setup profile' })
  const opened = await repository.openProfile(profile.id)

  const update = opened.saveSimulatedSyncState('Simulated account', '2026-01-01T00:00:00.000Z')
  await expect(opened.execute('INSERT INTO claims VALUES (?, ?, ?, ?)')).rejects.toThrow(/sync setup is being saved/i)
  await update
  await expect(opened.execute('INSERT INTO claims VALUES (?, ?, ?, ?)')).rejects.toThrow(/readonly/i)
  await opened.dispose()
})

it('does not migrate a profile when neither access safeguard is verified', async () => {
  const { repository } = createHarness(profileIds, 'unavailable')
  const legacy: FakeDatabase = {
    version: 2,
    hasTable: true,
    hasClaimsTable: true,
    hasSimulatedSyncTable: false,
    queryOnly: false,
    profile: {
      profile_id: profileIds[0],
      label: 'Legacy profile',
      real_name: null,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
  databases.set(`/profile-${profileIds[0]}.sqlite3`, legacy)

  const opened = await repository.openProfile(profileIds[0])

  expect(opened.access.mode).toBe('read-only')
  expect(legacy.version).toBe(2)
  expect(legacy.hasSimulatedSyncTable).toBe(false)
  await opened.dispose()
})
