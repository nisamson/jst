import type { StorageSession } from './local-storage'

export async function createProviderConnectionSchema(execute: StorageSession['execute']) {
  await execute(`CREATE TABLE storage_provider_connection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) BETWEEN 1 AND 100),
    account_label TEXT NOT NULL CHECK (length(trim(account_label)) BETWEEN 1 AND 255),
    location_id TEXT CHECK (location_id IS NULL OR length(trim(location_id)) BETWEEN 1 AND 512),
    connected_at TEXT NOT NULL
  )`)
}
