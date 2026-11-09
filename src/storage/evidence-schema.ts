import type { StorageSession } from './local-storage'

export async function createEvidenceSchema(execute: StorageSession['execute']) {
  await execute(`CREATE TABLE activity_links (
    id TEXT PRIMARY KEY NOT NULL,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL
  )`)
  await execute('CREATE INDEX activity_links_owner ON activity_links(activity_id, position)')
  await execute(`CREATE TABLE activity_files (
    id TEXT PRIMARY KEY NOT NULL,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK (size >= 0 AND size <= 10485760),
    description TEXT NOT NULL,
    bytes BLOB NOT NULL CHECK (length(bytes) = size)
  )`)
  await execute('CREATE INDEX activity_files_owner ON activity_files(activity_id, position)')
}
