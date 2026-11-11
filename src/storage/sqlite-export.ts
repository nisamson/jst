import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { activityTextFields } from './activity-model'

function rows(database: Database, sql: string) {
  return database.exec({ sql, rowMode: 'object', returnValue: 'resultRows' })
}

export function validateSnapshot(database: Database, profileId?: string): number {
  const [versionRow] = rows(database, 'PRAGMA user_version')
  const version = versionRow?.user_version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 6) {
    throw new Error('The profile database version cannot be safely exported or restored.')
  }
  const tables: Record<string, string[]> = {
    profile_metadata: ['id', 'profile_id', 'label', 'real_name', 'created_at'],
  }
  if (version >= 2) tables.claims = ['id', 'identifier', 'created_at', 'claim_start_date', ...(version >= 5 ? ['overview'] : [])]
  if (version >= 3) tables.simulated_sync_setup = ['id', 'provider_id', 'account_label', 'connected_at']
  if (version >= 4) tables.activities = ['id', 'claim_id', 'activity_date', 'kind', 'created_at', 'updated_at',
    'contact_method', 'contact_type', ...activityTextFields]
  if (version >= 6) {
    tables.activity_links = ['id', 'activity_id', 'position', 'label', 'url']
    tables.activity_files = ['id', 'activity_id', 'position', 'name', 'type', 'size', 'description', 'bytes']
  }
  const objects = rows(database, "SELECT type, name, sql FROM sqlite_schema WHERE type IN ('table', 'view', 'trigger') AND name NOT LIKE 'sqlite_%'")
  if (objects.length !== Object.keys(tables).length
    || objects.some((object) => object.type !== 'table' || typeof object.name !== 'string' || !Object.hasOwn(tables, object.name)
      || typeof object.sql !== 'string' || !/^CREATE TABLE\b/i.test(object.sql))) {
    throw new Error('The profile contains an unexpected database schema and cannot be safely exported.')
  }
  for (const [table, expected] of Object.entries(tables)) {
    const columns = rows(database, `PRAGMA table_xinfo("${table}")`)
    if (columns.length !== expected.length || columns.some((column) => typeof column.name !== 'string' || !expected.includes(column.name) || column.hidden !== 0)) {
      throw new Error('The profile contains unexpected database fields and cannot be safely exported.')
    }
  }
  const [metadata] = rows(database, 'SELECT profile_id FROM profile_metadata WHERE id = 1')
  if (profileId !== undefined && metadata?.profile_id !== profileId) throw new Error('The exported database does not belong to the selected profile.')
  return version
}

export function createProfileSnapshot(sqlite: Sqlite3Static, source: Database, profileId: string): Uint8Array<ArrayBuffer> {
  const copy = new sqlite.oo1.DB(':memory:', 'c')
  try {
    const destination = copy.pointer
    const original = source.pointer
    if (!destination || !original) throw new Error('The profile database is not open.')
    const backup = sqlite.capi.sqlite3_backup_init(destination, 'main', original, 'main')
    if (!backup) throw new Error(`Could not start the profile snapshot: ${sqlite.capi.sqlite3_errmsg(destination)}`)
    let result: number
    let finished: number
    try {
      result = sqlite.capi.sqlite3_backup_step(backup, -1)
    } finally {
      finished = sqlite.capi.sqlite3_backup_finish(backup)
    }
    if (result !== sqlite.capi.SQLITE_DONE || finished !== sqlite.capi.SQLITE_OK) {
      throw new Error(`The profile snapshot could not be completed (SQLite ${result}, ${finished}). Close other tabs and retry.`)
    }
    const version = validateSnapshot(copy, profileId)
    copy.exec('PRAGMA secure_delete = ON')
    if (version >= 3) copy.exec('DELETE FROM simulated_sync_setup')
    copy.exec('VACUUM')
    const integrity = rows(copy, 'PRAGMA integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || rows(copy, 'PRAGMA foreign_key_check').length) {
      throw new Error('The profile snapshot did not pass database integrity checks.')
    }
    const bytes = sqlite.capi.sqlite3_js_db_export(destination)
    if (!bytes.length) throw new Error('The profile snapshot is empty.')
    return bytes
  } finally {
    copy.close()
  }
}
