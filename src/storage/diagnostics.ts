import { initializeStorage } from './local-storage'
import type { StorageSession } from './local-storage'

const filename = '/jst-storage-diagnostics.sqlite3'

export interface DiagnosticRecord {
  token: string
  writtenAt: string
  sqliteVersion: string
}

async function readRecord(storage: StorageSession, expectedToken?: string): Promise<DiagnosticRecord> {
  const [row] = await storage.execute(
    'SELECT token, written_at, sqlite_version() AS sqlite_version FROM diagnostic_probe WHERE id = 1',
  )
  if (
    !row
    || typeof row.token !== 'string'
    || typeof row.written_at !== 'string'
    || typeof row.sqlite_version !== 'string'
  ) {
    throw new Error('No diagnostic record was found. Write a test record first.')
  }
  if (expectedToken && row.token !== expectedToken) {
    throw new Error('The saved diagnostic token does not match. Another tab may have replaced the test record.')
  }
  return { token: row.token, writtenAt: row.written_at, sqliteVersion: row.sqlite_version }
}

export async function writeDiagnosticRecord(): Promise<DiagnosticRecord> {
  const storage = await initializeStorage()
  try {
    await storage.openDatabase(filename, { create: true })
    await storage.execute(`
      CREATE TABLE IF NOT EXISTS diagnostic_probe (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token TEXT NOT NULL,
        written_at TEXT NOT NULL
      )
    `)
    const token = crypto.randomUUID()
    await storage.execute(
      `INSERT INTO diagnostic_probe (id, token, written_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET token = excluded.token, written_at = excluded.written_at`,
      [token, new Date().toISOString()],
    )
    await storage.closeDatabase()
    await storage.openDatabase(filename)
    return await readRecord(storage, token)
  } finally {
    await storage.dispose()
  }
}

export async function readDiagnosticRecord(expectedToken?: string): Promise<DiagnosticRecord> {
  const storage = await initializeStorage()
  try {
    await storage.openDatabase(filename)
    return await readRecord(storage, expectedToken)
  } finally {
    await storage.dispose()
  }
}

export async function clearDiagnosticRecord(): Promise<void> {
  const storage = await initializeStorage()
  try {
    await storage.openDatabase(filename)
    await storage.execute('DELETE FROM diagnostic_probe WHERE id = 1')
  } finally {
    await storage.dispose()
  }
}
