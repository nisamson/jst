import { initializeStorage } from './local-storage'
import type { StorageSession } from './local-storage'
import { getPersistenceStatus } from './environment'
import type { Persistence } from './environment'

const PROFILE_DATABASE_VERSION = 3
const MINIMUM_PROFILE_DATABASE_VERSION = 1
const PROFILE_FILENAME = /^profile-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.sqlite3$/
const CREATE_CLAIMS_TABLE = `
  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    created_at TEXT NOT NULL,
    claim_start_date TEXT
  )
`
const CREATE_SIMULATED_SYNC_TABLE = `
  CREATE TABLE IF NOT EXISTS simulated_sync_setup (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_id TEXT NOT NULL CHECK (provider_id = 'dummy'),
    account_label TEXT NOT NULL,
    connected_at TEXT NOT NULL
  )
`

export interface Profile {
  id: string
  label: string
  realName?: string
  createdAt: string
}

export interface CreateProfileInput {
  label: string
  realName?: string
}

export interface ProfileSession {
  profile: Profile
  access: {
    mode: 'read-write' | 'read-only'
    persistence: Persistence
    syncConnected: boolean
  }
  execute: StorageSession['execute']
  saveSimulatedSyncState: (accountLabel: string, connectedAt: string) => Promise<void>
  dispose: StorageSession['dispose']
}

export interface ProfileDiscoveryError {
  id: string
  message: string
}

export interface ProfileListing {
  profiles: Profile[]
  errors: ProfileDiscoveryError[]
}

interface ProfileDirectoryEntry {
  kind: string
}

interface ProfileDirectory {
  entries: () => AsyncIterable<[string, ProfileDirectoryEntry]>
}

interface ProfileRepositoryDependencies {
  initializeStorage: () => Promise<StorageSession>
  getDirectory: () => Promise<ProfileDirectory>
  createId: () => string
  getPersistenceStatus: () => Promise<Persistence>
}

const defaultDependencies: ProfileRepositoryDependencies = {
  initializeStorage,
  getDirectory: () => navigator.storage.getDirectory(),
  createId: () => crypto.randomUUID(),
  getPersistenceStatus,
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown storage error.'
}

function getProfileFilename(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('The profile ID is invalid.')
  }
  return `/profile-${id}.sqlite3`
}

function normalizeProfile(input: CreateProfileInput): Omit<Profile, 'id' | 'createdAt'> {
  const label = input.label.trim()
  if (!label) throw new Error('Enter a profile label before creating the profile.')
  const realName = input.realName?.trim()
  return realName ? { label, realName } : { label }
}

async function readProfile(storage: StorageSession, id: string): Promise<Profile> {
  const [versionRow] = await storage.execute('PRAGMA user_version')
  if (
    typeof versionRow?.user_version !== 'number'
    || versionRow.user_version < MINIMUM_PROFILE_DATABASE_VERSION
    || versionRow.user_version > PROFILE_DATABASE_VERSION
  ) {
    throw new Error(`Unsupported or incomplete profile database version for profile ${id}.`)
  }

  const [row] = await storage.execute(
    'SELECT profile_id, label, real_name, created_at FROM profile_metadata WHERE id = 1',
  )
  if (
    !row
    || typeof row.profile_id !== 'string'
    || row.profile_id !== id
    || typeof row.label !== 'string'
    || (row.real_name !== null && typeof row.real_name !== 'string')
    || typeof row.created_at !== 'string'
  ) {
    throw new Error(`Profile ${id} has missing or invalid metadata.`)
  }

  return {
    id,
    label: row.label,
    ...(typeof row.real_name === 'string' ? { realName: row.real_name } : {}),
    createdAt: row.created_at,
  }
}

async function migrateProfileDatabase(storage: StorageSession): Promise<void> {
  const [versionRow] = await storage.execute('PRAGMA user_version')
  if (versionRow?.user_version === PROFILE_DATABASE_VERSION) return
  if (versionRow?.user_version !== 1 && versionRow?.user_version !== 2) {
    throw new Error('The local profile database cannot be migrated from its current version.')
  }

  await storage.execute('BEGIN IMMEDIATE')
  let transactionOpen = true
  try {
    const [currentVersionRow] = await storage.execute('PRAGMA user_version')
    let currentVersion = currentVersionRow?.user_version
    if (typeof currentVersion !== 'number' || currentVersion < 1 || currentVersion > PROFILE_DATABASE_VERSION) {
      throw new Error('The local profile database changed while it was being migrated.')
    }
    while (currentVersion < PROFILE_DATABASE_VERSION) {
      if (currentVersion === 1) {
        await storage.execute(CREATE_CLAIMS_TABLE)
      } else if (currentVersion === 2) {
        await storage.execute(CREATE_SIMULATED_SYNC_TABLE)
      } else {
        throw new Error('The local profile database cannot be migrated from its current version.')
      }
      currentVersion += 1
      await storage.execute(`PRAGMA user_version = ${currentVersion}`)
    }

    await storage.execute('COMMIT')
    transactionOpen = false
  } catch (error) {
    if (transactionOpen) {
      try {
        await storage.execute('ROLLBACK')
      } catch (rollbackError) {
        throw new Error(
          `Profile migration failed: ${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`,
          { cause: rollbackError },
        )
      }
    }
    throw error
  }
}

async function hasSimulatedSyncAccess(storage: StorageSession): Promise<boolean> {
  const [row] = await storage.execute(
    'SELECT provider_id, account_label, connected_at FROM simulated_sync_setup WHERE id = 1',
  )
  if (!row) return false
  if (
    row.provider_id !== 'dummy'
    || typeof row.account_label !== 'string'
    || typeof row.connected_at !== 'string'
  ) {
    throw new Error('The saved simulated setup state is invalid.')
  }
  return true
}

async function saveSimulatedSyncState(
  storage: StorageSession,
  readOnly: boolean,
  accountLabel: string,
  connectedAt: string,
): Promise<void> {
  if (!accountLabel.trim() || !connectedAt.trim()) {
    throw new Error('The simulated setup state is invalid.')
  }
  if (readOnly) await storage.execute('PRAGMA query_only = OFF')

  let transactionOpen = false
  let failure: unknown
  try {
    await storage.execute('BEGIN IMMEDIATE')
    transactionOpen = true
    await storage.execute(
      `INSERT INTO simulated_sync_setup (id, provider_id, account_label, connected_at)
       VALUES (1, 'dummy', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider_id = excluded.provider_id,
         account_label = excluded.account_label,
         connected_at = excluded.connected_at`,
      [accountLabel.trim(), connectedAt],
    )
    await storage.execute('COMMIT')
    transactionOpen = false
  } catch (error) {
    failure = error
    if (transactionOpen) {
      try {
        await storage.execute('ROLLBACK')
      } catch (rollbackError) {
        failure = new Error(
          `Saving simulated setup failed: ${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`,
          { cause: rollbackError },
        )
      }
    }
  }

  if (readOnly) {
    try {
      await storage.execute('PRAGMA query_only = ON')
    } catch (restoreError) {
      failure = failure
        ? new Error(
          `Saving simulated setup failed: ${errorMessage(failure)} Read-only protection could not be restored: ${errorMessage(restoreError)}`,
          { cause: restoreError },
        )
        : restoreError
    }
  }
  if (failure) throw failure
}

async function containsFilename(directory: ProfileDirectory, filename: string): Promise<boolean> {
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind === 'file' && name === filename.slice(1)) return true
  }
  return false
}

export function createProfileRepository(
  dependencies: ProfileRepositoryDependencies = defaultDependencies,
) {
  async function createProfile(input: CreateProfileInput): Promise<Profile> {
    const normalized = normalizeProfile(input)
    const id = dependencies.createId()
    const filename = getProfileFilename(id)
    const createdAt = new Date().toISOString()
    const storage = await dependencies.initializeStorage()
    try {
      const directory = await dependencies.getDirectory()
      if (await containsFilename(directory, filename)) {
        throw new Error(`Profile ${id} already exists. Existing profile data was not changed.`)
      }

      await storage.openDatabase(filename, { create: true })
      let transactionOpen = false
      try {
        await storage.execute('BEGIN IMMEDIATE')
        transactionOpen = true

        const [versionRow] = await storage.execute('PRAGMA user_version')
        const [existingTable] = await storage.execute(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
        )
        if (versionRow?.user_version !== 0 || existingTable) {
          throw new Error(`Profile ${id} already contains database data. Existing records were not changed.`)
        }

        await storage.execute(`
          CREATE TABLE profile_metadata (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            profile_id TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            real_name TEXT,
            created_at TEXT NOT NULL
          )
        `)
        await storage.execute(CREATE_CLAIMS_TABLE)
        await storage.execute(CREATE_SIMULATED_SYNC_TABLE)
        await storage.execute(
          'INSERT INTO profile_metadata (id, profile_id, label, real_name, created_at) VALUES (1, ?, ?, ?, ?)',
          [id, normalized.label, normalized.realName ?? null, createdAt],
        )
        await storage.execute(`PRAGMA user_version = ${PROFILE_DATABASE_VERSION}`)
        await storage.execute('COMMIT')
        transactionOpen = false
      } catch (error) {
        if (transactionOpen) {
          try {
            await storage.execute('ROLLBACK')
          } catch (rollbackError) {
            throw new Error(
              `Profile creation failed: ${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`,
              { cause: rollbackError },
            )
          }
        }
        throw error
      }

      return { id, ...normalized, createdAt }
    } finally {
      await storage.dispose()
    }
  }

  async function listProfiles(): Promise<ProfileListing> {
    const storage = await dependencies.initializeStorage()
    try {
      const directory = await dependencies.getDirectory()
      const profiles: Profile[] = []
      const errors: ProfileDiscoveryError[] = []
      for await (const [filename, entry] of directory.entries()) {
        const match = entry.kind === 'file' ? PROFILE_FILENAME.exec(filename) : undefined
        if (!match) continue

        const id = match[1]
        try {
          await storage.openDatabase(`/${filename}`)
        } catch (error) {
          errors.push({ id, message: errorMessage(error) })
          continue
        }
        try {
          profiles.push(await readProfile(storage, id))
        } catch (error) {
          errors.push({ id, message: errorMessage(error) })
        } finally {
          await storage.closeDatabase()
        }
      }
      return {
        profiles: profiles.toSorted((left, right) => left.label.localeCompare(right.label)),
        errors,
      }
    } finally {
      await storage.dispose()
    }
  }

  async function openProfile(id: string): Promise<ProfileSession> {
    const filename = getProfileFilename(id)
    const storage = await dependencies.initializeStorage()
    try {
      await storage.openDatabase(filename)
      const profile = await readProfile(storage, id)
      const [versionRow] = await storage.execute('PRAGMA user_version')
      const syncConnected = versionRow?.user_version === PROFILE_DATABASE_VERSION
        ? await hasSimulatedSyncAccess(storage)
        : false
      const persistence = await dependencies.getPersistenceStatus()
      const readOnly = persistence !== 'granted' && !syncConnected

      if (!readOnly) await migrateProfileDatabase(storage)
      else await storage.execute('PRAGMA query_only = ON')

      let simulatedSyncWriteInProgress = false
      let sessionUnavailable = false
      const execute: StorageSession['execute'] = (sql, bind) => {
        if (sessionUnavailable) {
          return Promise.reject(new Error('The profile storage session is unavailable. Reopen the profile and retry.'))
        }
        if (simulatedSyncWriteInProgress) {
          return Promise.reject(new Error('Simulated setup is being saved. Retry the profile operation shortly.'))
        }
        return storage.execute(sql, bind)
      }

      return {
        profile,
        access: {
          mode: readOnly ? 'read-only' : 'read-write',
          persistence,
          syncConnected,
        },
        execute,
        async saveSimulatedSyncState(accountLabel, connectedAt) {
          if (sessionUnavailable) {
            throw new Error('The profile storage session is unavailable. Reopen the profile and retry.')
          }
          if (simulatedSyncWriteInProgress) {
            throw new Error('Simulated setup is already being saved. Retry the operation shortly.')
          }
          simulatedSyncWriteInProgress = true
          try {
            await saveSimulatedSyncState(storage, readOnly, accountLabel, connectedAt)
          } catch (error) {
            sessionUnavailable = true
            throw error
          } finally {
            simulatedSyncWriteInProgress = false
          }
        },
        dispose: storage.dispose,
      }
    } catch (error) {
      await storage.dispose()
      throw error
    }
  }

  return { createProfile, listProfiles, openProfile }
}

const profileRepository = createProfileRepository()

export const createProfile = (input: CreateProfileInput) => profileRepository.createProfile(input)
export const listProfiles = () => profileRepository.listProfiles()
export const openProfile = (id: string) => profileRepository.openProfile(id)
