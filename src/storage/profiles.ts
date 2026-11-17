import { initializeStorage } from './local-storage'
import type { StorageSession } from './local-storage'
import { getPersistenceStatus } from './environment'
import type { Persistence } from './environment'
import { createActivitySchema } from './activity-schema'
import { createEvidenceSchema } from './evidence-schema'
import { createProviderConnectionSchema } from './provider-connection-schema'
import { validateStorageProviderConnection } from '../sync/storage-provider'
import type { StorageProviderConnection } from '../sync/storage-provider'

const PROFILE_DATABASE_VERSION = 7
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
const ADD_CLAIM_OVERVIEW = 'ALTER TABLE claims ADD COLUMN overview TEXT'

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
  getStorageProviderConnection: () => Promise<StorageProviderConnection | undefined>
  connectStorageProvider: (connection: StorageProviderConnection) => Promise<StorageProviderConnection>
  disconnectStorageProvider: (providerId?: string) => Promise<void>
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
  syncStatuses: Record<string, SyncSetupStatus>
}

export type SyncSetupStatus =
  | { state: 'configured' | 'unconfigured' }
  | { state: 'error'; message: string }

interface ProfileDirectoryEntry {
  kind: string
}

interface ProfileDirectory {
  entries: () => AsyncIterable<[string, ProfileDirectoryEntry]>
  removeEntry: (name: string) => Promise<void>
}

interface ProfileRepositoryDependencies {
  initializeStorage: (signal?: AbortSignal) => Promise<StorageSession>
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
  if (typeof versionRow?.user_version !== 'number' || versionRow.user_version < 1 || versionRow.user_version > 7) {
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
      } else if (currentVersion === 3) {
        await createActivitySchema(storage.execute)
      } else if (currentVersion === 4) {
        await storage.execute(ADD_CLAIM_OVERVIEW)
      } else if (currentVersion === 5) {
        await createEvidenceSchema(storage.execute)
      } else if (currentVersion === 6) {
        await createProviderConnectionSchema(storage.execute)
        await storage.execute(`INSERT INTO storage_provider_connection (id, provider_id, account_label, connected_at)
          SELECT id, provider_id, account_label, connected_at FROM simulated_sync_setup WHERE id = 1`)
        await storage.execute('DROP TABLE simulated_sync_setup')
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

async function readStorageProviderConnection(storage: StorageSession): Promise<StorageProviderConnection | undefined> {
  const [version] = await storage.execute('PRAGMA user_version')
  if (typeof version?.user_version !== 'number' || version.user_version < 3) return undefined
  const table = version.user_version >= 7 ? 'storage_provider_connection' : 'simulated_sync_setup'
  const [row] = await storage.execute(
    `SELECT provider_id, account_label, ${version.user_version >= 7 ? 'location_id, ' : ''}connected_at FROM ${table} WHERE id = 1`,
  )
  if (!row) return undefined
  if (typeof row.provider_id !== 'string' || typeof row.account_label !== 'string'
    || typeof row.connected_at !== 'string'
    || (version.user_version >= 7 && row.location_id !== null && typeof row.location_id !== 'string')) {
    throw new Error('The saved storage provider connection is invalid.')
  }
  const connection: StorageProviderConnection = {
    providerId: row.provider_id,
    accountLabel: row.account_label,
    ...(typeof row.location_id === 'string' ? { locationId: row.location_id } : {}),
    connectedAt: row.connected_at,
  }
  validateStorageProviderConnection(connection)
  if (version.user_version < 7 && connection.providerId !== 'dummy') throw new Error('The saved simulated connection is invalid.')
  return connection
}

async function saveStorageProviderConnection(
  storage: StorageSession,
  readOnly: boolean,
  connection: StorageProviderConnection,
): Promise<StorageProviderConnection> {
  validateStorageProviderConnection(connection)
  const normalizedConnection: StorageProviderConnection = {
    providerId: connection.providerId,
    accountLabel: connection.accountLabel.trim(),
    ...(connection.locationId === undefined ? {} : { locationId: connection.locationId.trim() }),
    connectedAt: connection.connectedAt,
  }
  if (readOnly) await storage.execute('PRAGMA query_only = OFF')

  let transactionOpen = false
  let failure: unknown
  let saved = normalizedConnection
  try {
    await migrateProfileDatabase(storage)
    await storage.execute('BEGIN IMMEDIATE')
    transactionOpen = true
    const existing = await readStorageProviderConnection(storage)
    if (existing) {
      if (existing.providerId !== normalizedConnection.providerId || existing.accountLabel !== normalizedConnection.accountLabel
        || existing.locationId !== normalizedConnection.locationId) {
        throw new Error('This profile is already connected to another provider, account, or location. Disconnect it explicitly before switching.')
      }
      saved = existing
    } else {
      await storage.execute(
        `INSERT INTO storage_provider_connection (id, provider_id, account_label, location_id, connected_at)
         VALUES (1, ?, ?, ?, ?)`,
        [normalizedConnection.providerId, normalizedConnection.accountLabel, normalizedConnection.locationId ?? null, normalizedConnection.connectedAt],
      )
    }
    await storage.execute('COMMIT')
    transactionOpen = false
  } catch (error) {
    failure = error
    if (transactionOpen) {
      try {
        await storage.execute('ROLLBACK')
      } catch (rollbackError) {
        failure = new Error(
          `Saving sync setup failed: ${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`,
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
          `Saving sync setup failed: ${errorMessage(failure)} Read-only protection could not be restored: ${errorMessage(restoreError)}`,
          { cause: restoreError },
        )
        : restoreError
    }
  }
  if (failure) throw failure
  return saved
}

async function removeStorageProviderConnection(storage: StorageSession, readOnly: boolean, providerId?: string): Promise<void> {
  const existing = await readStorageProviderConnection(storage)
  if (!existing) return
  if (providerId && existing.providerId !== providerId) {
    throw new Error('The profile connection belongs to another provider. It was not disconnected.')
  }
  if (readOnly) await storage.execute('PRAGMA query_only = OFF')
  let failure: unknown
  let transactionOpen = false
  try {
    await migrateProfileDatabase(storage)
    await storage.execute('BEGIN IMMEDIATE')
    transactionOpen = true
    const current = await readStorageProviderConnection(storage)
    if (!current) {
      await storage.execute('COMMIT')
      transactionOpen = false
    } else {
      if (providerId && current.providerId !== providerId) throw new Error('The profile connection changed. Reopen the profile and retry.')
      await storage.execute('DELETE FROM storage_provider_connection WHERE id = 1')
      await storage.execute('COMMIT')
      transactionOpen = false
    }
  } catch (error) {
    failure = error
    if (transactionOpen) {
      try { await storage.execute('ROLLBACK') } catch (rollbackError) {
        failure = new Error(`Disconnect failed: ${errorMessage(error)} Rollback also failed: ${errorMessage(rollbackError)}`, { cause: rollbackError })
      }
    }
  }
  if (readOnly) {
    try { await storage.execute('PRAGMA query_only = ON') } catch (error) {
      failure = new Error(`Connection removal failed and read-only protection could not be restored: ${errorMessage(error)}`, { cause: error })
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

async function enableForeignKeys(storage: StorageSession) {
  await storage.execute('PRAGMA foreign_keys = ON')
  const [row] = await storage.execute('PRAGMA foreign_keys')
  if (row?.foreign_keys !== 1) throw new Error('Foreign-key enforcement is required to open this profile safely.')
}

export function createProfileRepository(
  dependencies: ProfileRepositoryDependencies = defaultDependencies,
) {
  async function deleteProfile(id: string): Promise<void> {
    const filename = getProfileFilename(id)
    const directory = await dependencies.getDirectory()
    await directory.removeEntry(filename.slice(1))
  }

  async function createLocalProfile(input: CreateProfileInput, backup?: Uint8Array<ArrayBuffer>): Promise<Profile> {
    let normalized = normalizeProfile(input)
    const id = dependencies.createId()
    const filename = getProfileFilename(id)
    const createdAt = new Date().toISOString()
    const storage = await dependencies.initializeStorage()
    let restoreDirectory: ProfileDirectory | undefined
    let profile: Profile
    try {
      const directory = await dependencies.getDirectory()
      if (await containsFilename(directory, filename)) {
        throw new Error(`Profile ${id} already exists. Existing profile data was not changed.`)
      }

      await storage.openDatabase(filename, { create: true })
      await enableForeignKeys(storage)
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
        if (backup) restoreDirectory = directory

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
        await createActivitySchema(storage.execute)
        await storage.execute(ADD_CLAIM_OVERVIEW)
        await createEvidenceSchema(storage.execute)
        await createProviderConnectionSchema(storage.execute)
        if (backup) {
          const restored = await storage.importProfile(backup)
          if (typeof restored.label !== 'string' || (restored.real_name !== null && typeof restored.real_name !== 'string')) {
            throw new Error('The restored profile metadata is invalid.')
          }
          normalized = normalizeProfile({
            label: restored.label,
            ...(typeof restored.real_name === 'string' ? { realName: restored.real_name } : {}),
          })
        }
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

      profile = { id, ...normalized, createdAt }
    } catch (error) {
      await storage.dispose().catch(() => {})
      if (restoreDirectory) {
        try {
          await restoreDirectory.removeEntry(filename.slice(1))
        } catch (cleanupError) {
          throw new Error(
            `Restore failed and its new temporary profile file could not be removed. Existing profiles were not changed. Retry profile discovery. ${errorMessage(cleanupError)}`,
            { cause: cleanupError },
          )
        }
      }
      throw error
    }
    await storage.dispose()
    return profile
  }

  const createProfile = (input: CreateProfileInput) => createLocalProfile(input)
  const importProfile = (bytes: Uint8Array<ArrayBuffer>) => createLocalProfile({ label: 'Restoring profile' }, bytes)

  async function listProfiles(): Promise<ProfileListing> {
    const storage = await dependencies.initializeStorage()
    try {
      const directory = await dependencies.getDirectory()
      const profiles: Profile[] = []
      const errors: ProfileDiscoveryError[] = []
      const syncStatuses: Record<string, SyncSetupStatus> = {}
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
          try {
            const [version] = await storage.execute('PRAGMA user_version')
            const configured = typeof version?.user_version === 'number' && version.user_version >= 3
              ? Boolean(await readStorageProviderConnection(storage))
              : false
            syncStatuses[id] = { state: configured ? 'configured' : 'unconfigured' }
          } catch (error) {
            syncStatuses[id] = { state: 'error', message: errorMessage(error) }
          }
        } catch (error) {
          errors.push({ id, message: errorMessage(error) })
        } finally {
          await storage.closeDatabase()
        }
      }
      return {
        profiles: profiles.toSorted((left, right) => left.label.localeCompare(right.label)),
        errors,
        syncStatuses,
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
      await enableForeignKeys(storage)
      const profile = await readProfile(storage, id)
      const [versionRow] = await storage.execute('PRAGMA user_version')
      const syncConnected = typeof versionRow?.user_version === 'number' && versionRow.user_version >= 3
        ? Boolean(await readStorageProviderConnection(storage))
        : false
      const persistence = await dependencies.getPersistenceStatus()
      const readOnly = persistence !== 'granted' && !syncConnected

      if (!readOnly) await migrateProfileDatabase(storage)
      else await storage.execute('PRAGMA query_only = ON')

      let providerConnectionWriteInProgress = false
      let sessionUnavailable = false
      const execute: StorageSession['execute'] = (sql, bind) => {
        if (sessionUnavailable) {
          return Promise.reject(new Error('The profile storage session is unavailable. Reopen the profile and retry.'))
        }
        if (providerConnectionWriteInProgress) {
          return Promise.reject(new Error('The provider connection is being updated. Retry the profile operation shortly.'))
        }
        return storage.execute(sql, bind)
      }
      const getStorageProviderConnection = async () => {
        if (sessionUnavailable) throw new Error('The profile storage session is unavailable. Reopen the profile and retry.')
        if (providerConnectionWriteInProgress) throw new Error('The provider connection is being updated. Retry shortly.')
        return readStorageProviderConnection(storage)
      }
      const connectStorageProvider = async (connection: StorageProviderConnection) => {
        if (sessionUnavailable) throw new Error('The profile storage session is unavailable. Reopen the profile and retry.')
        if (providerConnectionWriteInProgress) throw new Error('The provider connection is already being updated. Retry shortly.')
        providerConnectionWriteInProgress = true
        try {
          return await saveStorageProviderConnection(storage, readOnly, connection)
        } finally {
          providerConnectionWriteInProgress = false
        }
      }
      const disconnectStorageProvider = async (providerId?: string) => {
        if (sessionUnavailable) throw new Error('The profile storage session is unavailable. Reopen the profile and retry.')
        if (providerConnectionWriteInProgress) throw new Error('The provider connection is already being updated. Retry shortly.')
        providerConnectionWriteInProgress = true
        try {
          await removeStorageProviderConnection(storage, readOnly, providerId)
        } finally {
          providerConnectionWriteInProgress = false
        }
      }

      return {
        profile,
        access: {
          mode: readOnly ? 'read-only' : 'read-write',
          persistence,
          syncConnected,
        },
        execute,
        getStorageProviderConnection,
        connectStorageProvider,
        disconnectStorageProvider,
        async saveSimulatedSyncState(accountLabel, connectedAt) {
          if (sessionUnavailable) {
            throw new Error('The profile storage session is unavailable. Reopen the profile and retry.')
          }
          await connectStorageProvider({ providerId: 'dummy', accountLabel, connectedAt })
        },
        dispose: storage.dispose,
      }
    } catch (error) {
      await storage.dispose()
      throw error
    }
  }

  async function exportProfile(id: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    const filename = getProfileFilename(id)
    const storage = await dependencies.initializeStorage(signal)
    try {
      await storage.openDatabase(filename)
      await storage.execute('PRAGMA query_only = ON')
      await readProfile(storage, id)
      signal?.throwIfAborted()
      const bytes = await storage.exportProfile(id)
      signal?.throwIfAborted()
      return bytes
    } finally {
      await storage.dispose()
    }
  }

  return { createProfile, deleteProfile, listProfiles, openProfile, exportProfile, importProfile }
}

const profileRepository = createProfileRepository()

export const createProfile = (input: CreateProfileInput) => profileRepository.createProfile(input)
export const deleteProfile = (id: string) => profileRepository.deleteProfile(id)
export const listProfiles = () => profileRepository.listProfiles()
export const openProfile = (id: string) => profileRepository.openProfile(id)
export const exportProfile = (id: string, signal?: AbortSignal) => profileRepository.exportProfile(id, signal)
export const importProfile = (bytes: Uint8Array<ArrayBuffer>) => profileRepository.importProfile(bytes)
