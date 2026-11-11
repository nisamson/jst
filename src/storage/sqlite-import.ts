import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { activityTextFields, normalizeActivity } from './activity-model'
import type { ActivityInput } from './activity-model'
import { isCalendarDate } from './calendar-date'
import { validateEvidence } from './evidence-model'
import type { ActivityEvidence } from './evidence-model'
import type { SqlRow } from './protocol'
import { validateSnapshot } from './sqlite-export'

function rows(database: Database, sql: string) {
  return database.exec({ sql, rowMode: 'object', returnValue: 'resultRows' })
}

function text(value: unknown): asserts value is string {
  if (typeof value !== 'string') throw new Error('The backup contains invalid record metadata.')
}

function copyTable(source: Database, target: Database, table: string, columns: string[], nullable: string[] = []) {
  source.exec({
    sql: `SELECT ${columns.join(', ')} FROM ${table}`,
    rowMode: 'object',
    callback(record) {
      const row = record as SqlRow
      for (const column of columns) {
        const value = row[column]
        if (value === null && nullable.includes(column)) continue
        if (column === 'bytes') {
          if (!(value instanceof Uint8Array)) throw new Error('The backup contains invalid attachment bytes.')
        } else if (column === 'position' || column === 'size') {
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
            throw new Error('The backup contains invalid attachment metadata.')
          }
        } else text(value)
      }
      if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('The backup contains an invalid record ID.')
      if (table === 'claims' && (typeof row.identifier !== 'string' || !row.identifier.trim()
        || (row.claim_start_date !== null && !isCalendarDate(String(row.claim_start_date))))) {
        throw new Error('The backup contains invalid claim details.')
      }
      if (table === 'activities') normalizeActivity(row as unknown as ActivityInput)
      target.exec({
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        bind: columns.map((column) => row[column]),
      })
    },
  })
}

export function restoreProfileSnapshot(sqlite: Sqlite3Static, target: Database, bytes: Uint8Array<ArrayBuffer>): SqlRow {
  if (rows(target, 'PRAGMA user_version')[0]?.user_version !== 0 || rows(target, 'SELECT id FROM profile_metadata').length) {
    throw new Error('Restore requires a new, empty profile database.')
  }
  if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') {
    throw new Error('Choose a valid exported SQLite profile database.')
  }
  const source = new sqlite.oo1.DB(':memory:', 'c')
  try {
    const pointer = source.pointer
    if (!pointer) throw new Error('The backup could not be opened.')
    const allocation = sqlite.wasm.allocFromTypedArray(bytes)
    const result = sqlite.capi.sqlite3_deserialize(pointer, 'main', allocation, bytes.byteLength, bytes.byteLength,
      sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_READONLY)
    if (result !== sqlite.capi.SQLITE_OK) {
      throw new Error('The backup could not be read as a SQLite database.')
    }
    source.exec('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON')
    const version = validateSnapshot(source)
    const integrity = rows(source, 'PRAGMA integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || rows(source, 'PRAGMA foreign_key_check').length) {
      throw new Error('The backup did not pass database integrity checks.')
    }
    const metadata = rows(source, 'SELECT id, profile_id, label, real_name, created_at FROM profile_metadata')
    const profile = metadata[0]
    if (metadata.length !== 1 || profile.id !== 1 || typeof profile.profile_id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(profile.profile_id)
      || typeof profile.label !== 'string' || !profile.label.trim()
      || (profile.real_name !== null && typeof profile.real_name !== 'string')
      || typeof profile.created_at !== 'string' || !Number.isFinite(Date.parse(profile.created_at))) {
      throw new Error('The backup has missing or invalid profile metadata.')
    }
    if (version >= 2) {
      copyTable(source, target, 'claims', ['id', 'identifier', 'created_at', 'claim_start_date', ...(version >= 5 ? ['overview'] : [])],
        ['claim_start_date', 'overview'])
    }
    if (version >= 4) {
      copyTable(source, target, 'activities', ['id', 'claim_id', 'activity_date', 'kind', 'created_at', 'updated_at',
        'contact_method', 'contact_type', ...activityTextFields], ['contact_method', 'contact_type', ...activityTextFields])
    }
    if (version >= 6) {
      copyTable(source, target, 'activity_links', ['id', 'activity_id', 'position', 'label', 'url'])
      copyTable(source, target, 'activity_files', ['id', 'activity_id', 'position', 'name', 'type', 'size', 'description', 'bytes'])
      for (const activity of rows(target, 'SELECT id FROM activities')) {
        const links = target.exec({ sql: 'SELECT id, label, url FROM activity_links WHERE activity_id = ?', bind: [activity.id],
          rowMode: 'object', returnValue: 'resultRows' })
        const files = target.exec({ sql: 'SELECT id, name, type, size, description FROM activity_files WHERE activity_id = ?', bind: [activity.id],
          rowMode: 'object', returnValue: 'resultRows' })
        validateEvidence({ links, files } as ActivityEvidence)
      }
    }
    if (rows(target, 'PRAGMA foreign_key_check').length) throw new Error('The backup contains records without their owning claim or activity.')
    return { label: `${profile.label.trim()} (restored copy)`, real_name: profile.real_name }
  } finally {
    source.close()
  }
}
