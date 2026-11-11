import { afterEach, beforeAll, expect, it } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { createActivitySchema } from './activity-schema'
import { createEvidenceSchema } from './evidence-schema'
import { restoreProfileSnapshot } from './sqlite-import'
import { createProfileSnapshot } from './sqlite-export'
import type { StorageSession } from './local-storage'

let sqlite: Sqlite3Static
const databases: Database[] = []
const profileId = '11111111-1111-4111-8111-111111111111'
const activityId = '22222222-2222-4222-8222-222222222222'
const fileId = '33333333-3333-4333-8333-333333333333'
const linkId = '44444444-4444-4444-8444-444444444444'

beforeAll(async () => { sqlite = await sqlite3InitModule() })
afterEach(() => { for (const db of databases.splice(0)) db.close() })

async function database(source = false) {
  const db = new sqlite.oo1.DB(':memory:', 'c')
  databases.push(db)
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE profile_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1), profile_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL, real_name TEXT, created_at TEXT NOT NULL);
    CREATE TABLE claims (
      id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, created_at TEXT NOT NULL,
      claim_start_date TEXT, overview TEXT);
    CREATE TABLE simulated_sync_setup (
      id INTEGER PRIMARY KEY CHECK (id = 1), provider_id TEXT NOT NULL,
      account_label TEXT NOT NULL, connected_at TEXT NOT NULL);`)
  const execute: StorageSession['execute'] = async (sql) => {
    db.exec(sql)
    return []
  }
  await createActivitySchema(execute)
  await createEvidenceSchema(execute)
  if (source) {
    db.exec({ sql: 'INSERT INTO profile_metadata VALUES (1, ?, ?, ?, ?)',
      bind: [profileId, 'My profile', 'Alex Example', '2026-01-01T00:00:00Z'] })
    db.exec(`PRAGMA user_version = 6;
      INSERT INTO claims VALUES ('claim-1', 'My claim', '2026-01-01', '2026-01-04', 'My overview');
      INSERT INTO simulated_sync_setup VALUES (1, 'dummy', 'Private account', '2026-01-01');`)
    db.exec({ sql: `INSERT INTO activities (id, claim_id, activity_date, kind, created_at, updated_at, activity_description)
      VALUES (?, 'claim-1', '2026-01-04', 'other_activity', '2026-01-01', '2026-01-01', 'Workshop')`, bind: [activityId] })
    db.exec({ sql: 'INSERT INTO activity_links VALUES (?, ?, 0, ?, ?)',
      bind: [linkId, activityId, 'Receipt', 'https://example.test/receipt'] })
    db.exec({ sql: 'INSERT INTO activity_files VALUES (?, ?, 0, ?, ?, 4, ?, ?)',
      bind: [fileId, activityId, 'proof.bin', 'application/octet-stream', 'My proof', new Uint8Array([0, 1, 128, 255])] })
  }
  return db
}

function bytes(source: Database) {
  if (!source.pointer) throw new Error('Database closed')
  return sqlite.capi.sqlite3_js_db_export(source.pointer)
}

function rows(db: Database, sql: string) {
  return db.exec({ sql, rowMode: 'object', returnValue: 'resultRows' })
}

it('round trips a real exported snapshot into canonical tables without sync setup or the original profile identity', async () => {
  const source = await database(true)
  const target = await database()
  const snapshot = createProfileSnapshot(sqlite, source, profileId)
  const restored = restoreProfileSnapshot(sqlite, target, snapshot)
  expect(restored).toEqual({ label: 'My profile (restored copy)', real_name: 'Alex Example' })
  expect(rows(target, 'SELECT * FROM profile_metadata')).toEqual([])
  expect(rows(target, 'SELECT identifier, overview FROM claims')).toEqual([{ identifier: 'My claim', overview: 'My overview' }])
  expect(rows(target, 'SELECT activity_description FROM activities')).toEqual([{ activity_description: 'Workshop' }])
  expect(rows(target, 'SELECT url FROM activity_links')).toEqual([{ url: 'https://example.test/receipt' }])
  const [file] = rows(target, 'SELECT description, bytes FROM activity_files')
  expect(file.description).toBe('My proof')
  expect(Array.from(file.bytes as Uint8Array)).toEqual([0, 1, 128, 255])
  expect(rows(target, 'SELECT * FROM simulated_sync_setup')).toEqual([])
  expect(rows(source, 'SELECT account_label FROM simulated_sync_setup')).toEqual([{ account_label: 'Private account' }])
})

it.each([1, 2, 3, 4, 5])('restores version-%i exports into current tables without changing the source', async (version) => {
  const source = await database(true)
  source.exec('DROP TABLE activity_files; DROP TABLE activity_links')
  if (version < 5) source.exec('ALTER TABLE claims DROP COLUMN overview')
  if (version < 4) source.exec('DROP TABLE activities')
  if (version < 3) source.exec('DROP TABLE simulated_sync_setup')
  if (version < 2) source.exec('DROP TABLE claims')
  source.exec(`PRAGMA user_version = ${version}`)
  const target = await database()
  expect(restoreProfileSnapshot(sqlite, target, bytes(source)).label).toBe('My profile (restored copy)')
  expect(rows(target, 'SELECT * FROM claims')).toHaveLength(version >= 2 ? 1 : 0)
  expect(rows(target, 'SELECT * FROM activities')).toHaveLength(version >= 4 ? 1 : 0)
  expect(rows(source, 'PRAGMA user_version')).toEqual([{ user_version: version }])
})

it('enforces evidence limits and canonical constraints even if the backup omits them', async () => {
  const source = await database(true)
  const target = await database()
  source.exec(`DROP TABLE activity_files;
    CREATE TABLE activity_files (
      id TEXT, activity_id TEXT, position INTEGER, name TEXT, type TEXT, size INTEGER, description TEXT, bytes BLOB);
    INSERT INTO activity_files VALUES ('${fileId}', '${activityId}', 0, 'bad.bin', '', 9, '', X'0001');`)
  target.exec('BEGIN IMMEDIATE')
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('CHECK constraint failed')
  target.exec('ROLLBACK')
  source.exec('DELETE FROM activity_files')
  for (let index = 0; index < 11; index++) {
    source.exec({ sql: 'INSERT INTO activity_files VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      bind: [`55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, activityId, index, 'empty.bin', '', '', new Uint8Array()] })
  }
  target.exec('BEGIN IMMEDIATE')
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('up to 10 files')
  target.exec('ROLLBACK')
  expect(rows(target, 'SELECT * FROM claims')).toEqual([])
})

it('rejects invalid files, unsupported versions, and unexpected executable schema', async () => {
  const source = await database(true)
  const target = await database()
  expect(() => restoreProfileSnapshot(sqlite, target, new Uint8Array([1, 2, 3]))).toThrow('valid exported SQLite')
  source.exec('PRAGMA user_version = 99')
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('version')
  source.exec(`PRAGMA user_version = 6;
    CREATE TRIGGER unwanted AFTER INSERT ON claims BEGIN DELETE FROM activities; END;`)
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('unexpected database schema')
  expect(rows(target, 'SELECT * FROM claims')).toEqual([])
})

it('rejects invalid profile metadata and corrupt bytes', async () => {
  const source = await database(true)
  const target = await database()
  source.exec("UPDATE profile_metadata SET label = ''")
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('profile metadata')
  const corrupt = bytes(source)
  corrupt.fill(255, 100, Math.min(4096, corrupt.length))
  expect(() => restoreProfileSnapshot(sqlite, target, corrupt)).toThrow()
})

it('rejects unsafe links and rolls back partially copied records', async () => {
  const source = await database(true)
  const target = await database()
  source.exec("UPDATE activity_links SET url = 'javascript:alert(1)'")
  target.exec('BEGIN IMMEDIATE')
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('HTTP or HTTPS')
  target.exec('ROLLBACK')
  expect(rows(target, 'SELECT * FROM claims')).toEqual([])
  expect(rows(target, 'SELECT * FROM activity_files')).toEqual([])
})

it('rejects orphaned evidence and refuses to import into an existing profile', async () => {
  const source = await database(true)
  const target = await database()
  source.exec(`PRAGMA foreign_keys = OFF; UPDATE activity_files SET activity_id = 'missing';`)
  expect(() => restoreProfileSnapshot(sqlite, target, bytes(source))).toThrow('integrity checks')
  expect(() => restoreProfileSnapshot(sqlite, source, bytes(source))).toThrow('new, empty')
})
