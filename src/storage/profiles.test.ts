import { beforeEach, expect, it, vi } from 'vitest'
import type { SqlValue } from '@sqlite.org/sqlite-wasm'
import { createProfileRepository } from './profiles'
import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'

interface FakeDatabase {
  version: number
  hasTable: boolean
  hasClaimsTable: boolean
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
let storage: StorageSession

function row(values: Record<string, SqlValue>): SqlRow {
  return values
}

function createHarness(ids = profileIds) {
  const initializeStorage = vi.fn(async () => storage)
  const getDirectory = vi.fn(async () => ({
    async *entries(): AsyncGenerator<[string, { kind: string }]> {
      for (const filename of databases.keys()) {
        yield [filename.slice(1), { kind: 'file' }]
      }
      yield ['not-a-profile.sqlite3', { kind: 'file' }]
      yield ['profile-33333333-3333-4333-8333-333333333333.sqlite3', { kind: 'directory' }]
    },
  }))
  let nextId = 0
  const repository = createProfileRepository({
    initializeStorage,
    getDirectory,
    createId: () => ids[nextId++],
  })
  return { repository, initializeStorage, getDirectory }
}

beforeEach(() => {
  databases = new Map()
  activeDatabase = undefined
  failInsert = false
  storage = {
    async openDatabase(filename, options) {
      let database = databases.get(filename)
      if (!database && options?.create) {
        database = { version: 0, hasTable: false, hasClaimsTable: false }
        databases.set(filename, database)
      }
      if (!database) throw new Error('Database does not exist.')
      if (activeDatabase) throw new Error('Another database is open.')
      activeDatabase = database
    },
    async execute(sql, bind): Promise<SqlRow[]> {
      if (!activeDatabase) throw new Error('No database is open.')
      const statement = sql.replaceAll(/\s+/g, ' ').trim()
      if (statement === 'BEGIN IMMEDIATE' || statement === 'COMMIT' || statement === 'ROLLBACK') return []
      if (statement === 'PRAGMA user_version') return [row({ user_version: activeDatabase.version })]
      if (statement === 'PRAGMA user_version = 2') {
        activeDatabase.version = 2
        return []
      }
      if (statement === 'PRAGMA user_version = 1') {
        activeDatabase.version = 1
        return []
      }
      if (statement.startsWith('SELECT name FROM sqlite_schema')) {
        return activeDatabase.hasTable ? [row({ name: 'profile_metadata' })] : []
      }
      if (statement.startsWith('CREATE TABLE profile_metadata')) {
        activeDatabase.hasTable = true
        return []
      }
      if (statement.startsWith('CREATE TABLE claims')) {
        activeDatabase.hasClaimsTable = true
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
  expect(listing).toEqual({ profiles: [first, second], errors: [] })

  const opened = await repository.openProfile(first.id)
  expect(opened.profile).toEqual(first)
  expect(databases.get(`/profile-${first.id}.sqlite3`)?.version).toBe(2)
  expect(databases.get(`/profile-${first.id}.sqlite3`)?.hasClaimsTable).toBe(true)
  await opened.dispose()
  expect(initializeStorage).toHaveBeenCalledTimes(4)
})

it('rejects empty labels before initializing storage', async () => {
  const { repository, initializeStorage } = createHarness()
  await expect(repository.createProfile({ label: '  ' })).rejects.toThrow(/profile label/)
  expect(initializeStorage).not.toHaveBeenCalled()
  expect(databases.size).toBe(0)
})

it('does not overwrite an existing profile when an ID collides', async () => {
  const { repository } = createHarness([profileIds[0], profileIds[0]])
  const existing = await repository.createProfile({ label: 'Keep this profile' })
  await expect(repository.createProfile({ label: 'Replacement' })).rejects.toThrow(/already exists/)

  const listing = await repository.listProfiles()
  expect(listing).toEqual({ profiles: [existing], errors: [] })
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
  expect(legacy.version).toBe(2)
  expect(legacy.hasClaimsTable).toBe(true)
  await opened.dispose()
})
