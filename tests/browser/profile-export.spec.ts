import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openSnapshot(bytes: Uint8Array) {
  const sqlite = await sqlite3InitModule()
  const database = new sqlite.oo1.DB(':memory:', 'c')
  const pointer = database.pointer
  if (!pointer) throw new Error('Could not open the SQLite reader.')
  const allocation = sqlite.wasm.allocFromTypedArray(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  const result = sqlite.capi.sqlite3_deserialize(pointer, 'main', allocation, bytes.byteLength, bytes.byteLength,
    sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_READONLY)
  if (result !== sqlite.capi.SQLITE_OK) {
    database.close()
    throw new Error(`Could not read the exported SQLite database: ${result}`)
  }
  return database
}

function query(database: Database, sql: string) {
  return database.exec({ sql, rowMode: 'object', returnValue: 'resultRows' })
}

async function createProfile(page: Page, label: string) {
  await page.getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Profile label', exact: true }).fill(label)
  await page.locator('form').getByRole('button', { name: 'Create profile', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without syncing' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
})

test('downloads a consistent profile database with evidence and excludes sync setup', async ({ page }) => {
  test.setTimeout(120_000)
  await createProfile(page, 'Export profile')
  const originalProfileId = new URL(page.url()).searchParams.get('profile')
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  const claim = page.getByRole('dialog', { name: 'Create claim', exact: true })
  await claim.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Exported claim')
  await claim.getByRole('button', { name: 'Create claim', exact: true }).click()
  await page.getByRole('button', { name: 'Add activity', exact: true }).click()
  const activity = page.getByRole('dialog', { name: 'Add activity', exact: true })
  await activity.getByRole('combobox', { name: 'Activity kind', exact: true }).selectOption('other_activity')
  await activity.getByRole('textbox', { name: 'Activity description', exact: true }).fill('Exported workshop')
  await activity.getByRole('button', { name: 'Add link', exact: true }).click()
  await activity.getByRole('textbox', { name: 'Link 1 label (optional)', exact: true }).fill('Receipt link')
  await activity.getByRole('textbox', { name: 'Link 1 URL', exact: true }).fill('https://example.test/receipt')
  await activity.getByLabel('Choose files', { exact: true }).setInputFiles({
    name: 'proof.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 128, 255]),
  })
  await activity.getByRole('textbox', { name: 'File 1 description (optional)', exact: true }).fill('Proof description')
  await activity.getByRole('button', { name: 'Add activity', exact: true }).click()
  await expect(activity).toBeHidden()
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await page.getByRole('button', { name: 'Set up sync for Export profile' }).click()
  await page.getByRole('button', { name: 'Connect provider' }).click()
  await expect(page.getByRole('alert', { name: 'Setup complete' })).toBeVisible()
  await page.keyboard.press('Escape')
  await createProfile(page, 'Other profile')
  await page.getByRole('button', { name: 'Create claim', exact: true }).click()
  await claim.getByRole('textbox', { name: 'Claim identifier', exact: true }).fill('Other profile claim')
  await claim.getByRole('button', { name: 'Create claim', exact: true }).click()
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await page.getByRole('button', { name: 'Export database for Export profile', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export profile database', exact: true })
  await expect(dialog).toContainText('not encrypted')
  await expect(dialog).toContainText('restore a separate copy')
  const downloaded = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('Export profile.sqlite3')
  await expect(dialog.getByRole('status')).toContainText('browser was asked to download')
  const path = await download.path()
  if (!path) throw new Error('The database download was unavailable.')
  const data = await readFile(path)
  const db = await openSnapshot(data)
  try {
    expect(query(db, 'PRAGMA integrity_check')).toEqual([expect.objectContaining({ integrity_check: 'ok' })])
    expect(query(db, 'PRAGMA foreign_key_check')).toEqual([])
    expect(query(db, 'SELECT label FROM profile_metadata')[0]).toMatchObject({ label: 'Export profile' })
    expect(query(db, 'SELECT identifier FROM claims')).toEqual([expect.objectContaining({ identifier: 'Exported claim' })])
    expect(query(db, 'SELECT activity_description FROM activities')[0]).toMatchObject({ activity_description: 'Exported workshop' })
    expect(query(db, 'SELECT label, url FROM activity_links')[0]).toMatchObject({ label: 'Receipt link', url: 'https://example.test/receipt' })
    const file = query(db, 'SELECT name, description, bytes FROM activity_files')[0]
    expect(file).toMatchObject({ name: 'proof.bin', description: 'Proof description' })
    expect(Array.from(file!.bytes as Uint8Array)).toEqual([0, 1, 128, 255])
    expect(query(db, 'SELECT count(*) AS count FROM simulated_sync_setup')[0]).toMatchObject({ count: 0 })
  } finally { db.close() }
  expect(data.includes(Buffer.from('Simulated account'))).toBe(false)
  expect(data.includes(Buffer.from('Other profile claim'))).toBe(false)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Set up sync for Export profile' })).toHaveAccessibleName('Set up sync for Export profile — setup saved')

  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click()
  const restore = page.getByRole('dialog', { name: 'Restore profile from backup', exact: true })
  await restore.locator('input[type="file"]').setInputFiles(path)
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage
    let importing = false
    Worker.prototype.postMessage = function (message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
      if (typeof message === 'object' && message !== null && 'type' in message) {
        if (message.type === 'import-profile') importing = true
        if (importing && message.type === 'execute' && 'sql' in message && typeof message.sql === 'string'
          && message.sql.startsWith('INSERT INTO profile_metadata') && 'id' in message) {
          Worker.prototype.postMessage = original
          const id = message.id
          queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: { id, error: 'disk is full' } })))
          return
        }
      }
      Reflect.apply(original, this, transfer === undefined ? [message] : [message, transfer])
    }
  })
  await restore.getByRole('button', { name: 'Restore profile', exact: true }).click()
  await expect(restore.getByRole('alert', { name: 'Profile could not be restored', exact: true })).toContainText('disk is full')
  await restore.getByRole('button', { name: 'Restore profile', exact: true }).click()
  await expect(restore.getByRole('status')).toContainText('Export profile (restored copy)')
  await restore.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Set up sync for Export profile (restored copy)' }))
    .toHaveAccessibleName('Set up sync for Export profile (restored copy) — not configured')
  await expect(page.getByRole('button', { name: 'Set up sync for Export profile — setup saved', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Export profile (restored copy) profile', exact: true }).click()
  expect(new URL(page.url()).searchParams.get('profile')).not.toBe(originalProfileId)
  await page.getByRole('navigation', { name: 'Claims', exact: true }).getByRole('button', { name: 'Exported claim', exact: true }).click()
  await page.getByRole('region', { name: 'Selected activity week', exact: true })
    .getByRole('button', { name: /^Exported workshop,/ }).click()
  const details = page.getByRole('region', { name: 'Activity details', exact: true })
  await expect(details).toContainText('Proof description')
  await expect(details.getByRole('link', { name: 'Receipt link', exact: true })).toHaveAttribute('href', 'https://example.test/receipt')
  const restoredFile = page.waitForEvent('download')
  await details.getByRole('button', { name: 'Download proof.bin', exact: true }).click()
  expect(Array.from(await readFile((await (await restoredFile).path())!))).toEqual([0, 1, 128, 255])
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()

  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })

  await page.reload()
  await page.getByRole('button', { name: 'Other profile profile', exact: true }).click()
  await expect(page.getByRole('note', { name: 'Profile is read-only' })).toBeVisible()
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await page.setViewportSize({ width: 320, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: 'Export database for Other profile', exact: true }).click()
  const secondDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  const secondPath = await (await secondDownload).path()
  if (!secondPath) throw new Error('The read-only profile download was unavailable.')
  const secondDb = await openSnapshot(await readFile(secondPath))
  try {
    expect(query(secondDb, 'SELECT identifier FROM claims')).toEqual([expect.objectContaining({ identifier: 'Other profile claim' })])
    expect(query(secondDb, 'SELECT count(*) AS count FROM activity_files')[0]).toMatchObject({ count: 0 })
  } finally { secondDb.close() }
})

test('cancels before restore, rejects invalid files without leaving profiles, and retries a legacy backup with read-only access', async ({ page }) => {
  test.setTimeout(120_000)
  await createProfile(page, 'Keep original')
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  const sqlite = await sqlite3InitModule()
  const legacy = new sqlite.oo1.DB(':memory:', 'c')
  let backup: Buffer
  try {
    legacy.exec(`CREATE TABLE profile_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1), profile_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL, real_name TEXT, created_at TEXT NOT NULL);
      INSERT INTO profile_metadata VALUES (1, '11111111-1111-4111-8111-111111111111', 'Legacy backup', NULL, '2026-01-01');
      PRAGMA user_version = 1;`)
    backup = Buffer.from(sqlite.capi.sqlite3_js_db_export(legacy.pointer!))
  } finally { legacy.close() }
  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore profile from backup', exact: true })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'backup.sqlite3', mimeType: 'application/vnd.sqlite3', buffer: backup,
  })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Export database for / })).toHaveCount(1)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'invalid.sqlite3', mimeType: 'application/vnd.sqlite3', buffer: Buffer.from('not a SQLite backup'),
  })
  await dialog.getByRole('button', { name: 'Restore profile', exact: true }).click()
  await expect(dialog.getByRole('alert', { name: 'Profile could not be restored', exact: true })).toContainText('valid exported SQLite')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Retry profile discovery', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Export database for / })).toHaveCount(1)
  await expect(page.getByRole('alert', { name: 'Some local profile files could not be read', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Restore from backup', exact: true }).click()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'backup.sqlite3', mimeType: 'application/vnd.sqlite3', buffer: backup,
  })
  await page.setViewportSize({ width: 320, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await dialog.getByRole('button', { name: 'Restore profile', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Legacy backup (restored copy)')
  await dialog.getByRole('button', { name: 'Open restored profile', exact: true }).click()
  await expect(page.getByRole('note', { name: 'Profile is read-only', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Keep original profile', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Export database for / })).toHaveCount(2)
})

test('reports unsafe schema without changing the source and permits retry', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This test modifies the profile through Vite source modules.')
  await createProfile(page, 'Retry export')
  const id = new URL(page.url()).searchParams.get('profile')
  if (!id) throw new Error('Missing profile ID.')
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await page.evaluate(async (profileId) => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const session = await profiles.openProfile(profileId)
    try { await session.execute('CREATE TABLE unexpected_private_data (value TEXT)') } finally { await session.dispose() }
  }, id)
  await page.getByRole('button', { name: 'Export database for Retry export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export profile database', exact: true })
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  const error = dialog.getByRole('alert', { name: 'Profile could not be exported' })
  await expect(error).toContainText('unexpected database schema')
  await expect(error).toContainText('Your local profile was not changed')
  await page.evaluate(async (profileId) => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const session = await profiles.openProfile(profileId)
    try {
      const tables = await session.execute("SELECT name FROM sqlite_schema WHERE name = 'unexpected_private_data'")
      if (tables.length !== 1) throw new Error('The source database was changed.')
      await session.execute('DROP TABLE unexpected_private_data')
      await session.execute('ALTER TABLE simulated_sync_setup ADD COLUMN unexpected_secret TEXT')
    } finally { await session.dispose() }
  }, id)
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  await expect(error).toContainText('unexpected database fields')
  await page.evaluate(async (profileId) => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const session = await profiles.openProfile(profileId)
    try { await session.execute('ALTER TABLE simulated_sync_setup DROP COLUMN unexpected_secret') } finally { await session.dispose() }
  }, id)
  await page.evaluate(() => {
    const original = URL.createObjectURL
    URL.createObjectURL = () => {
      URL.createObjectURL = original
      throw new Error('Download preparation failed')
    }
  })
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  await expect(error).toContainText('Download preparation failed')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('Retry export.sqlite3')
})

test('cancels a pending export without losing the profile or starting a download', async ({ page }) => {
  await createProfile(page, 'Cancel export')
  await page.getByRole('link', { name: 'Profiles', exact: true }).click()
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'export-profile') return
      Reflect.apply(original, this, transfer === undefined ? [message] : [message, transfer])
    }
  })
  await page.getByRole('button', { name: 'Export database for Cancel export', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export profile database', exact: true })
  let downloadStarted = false
  page.on('download', () => { downloadStarted = true })
  await dialog.getByRole('button', { name: 'Download database', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Preparing')
  await dialog.getByRole('button', { name: 'Cancel export', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Export cancelled')
  expect(downloadStarted).toBe(false)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel export profile', exact: true }).click()
  await expect(page.getByText('Profile: Cancel export')).toBeVisible()
})

test('exports a profile containing a large attachment', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This test seeds an attachment through Vite source modules.')
  test.setTimeout(120_000)
  await page.evaluate(async () => {
    const profilesPath = '/src/storage/profiles.ts'
    const claimsPath = '/src/storage/claims.ts'
    const activitiesPath = '/src/storage/activities.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(profilesPath)
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const activities: typeof import('../../src/storage/activities') = await import(activitiesPath)
    const profile = await profiles.createProfile({ label: 'Large attachment' })
    const session = await profiles.openProfile(profile.id)
    try {
      const claim = await claims.createClaim(session.execute, { identifier: 'Large evidence claim' })
      const bytes = new Uint8Array(8 * 1024 * 1024).fill(167)
      bytes[0] = 23
      bytes[bytes.length - 1] = 42
      await activities.saveActivity(session.execute, claim.id, {
        kind: 'other_activity', activity_date: '2026-01-04', activity_description: 'Large evidence activity',
      }, undefined, {
        links: [], files: [{ id: crypto.randomUUID(), name: 'large.bin', type: 'application/octet-stream',
          size: bytes.length, description: 'Large file', bytes }],
      })
    } finally { await session.dispose() }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Export database for Large attachment', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export profile database' }).getByRole('button', { name: 'Download database' }).click()
  const path = await (await download).path()
  if (!path) throw new Error('The large export download was unavailable.')
  const snapshot = await openSnapshot(await readFile(path))
  try {
    const file = query(snapshot, 'SELECT size, bytes FROM activity_files')[0]
    expect(file.size).toBe(8 * 1024 * 1024)
    expect(file.bytes).toBeInstanceOf(Uint8Array)
    const bytes = file.bytes as Uint8Array
    expect(bytes.length).toBe(8 * 1024 * 1024)
    expect([bytes[0], bytes[bytes.length >> 1], bytes[bytes.length - 1]]).toEqual([23, 167, 42])
  } finally { snapshot.close() }
})

test('exports a consistent snapshot during concurrent writes without migrating legacy profiles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('production'), 'This test uses Vite source modules for concurrent database writes.')
  test.setTimeout(120_000)
  const snapshots = await page.evaluate(async () => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const claimsPath = '/src/storage/claims.ts'
    const claims: typeof import('../../src/storage/claims') = await import(claimsPath)
    const storagePath = '/src/storage/local-storage.ts'
    const storage: typeof import('../../src/storage/local-storage') = await import(storagePath)
    const profile = await profiles.createProfile({ label: 'Before transaction' })
    const writer = await profiles.openProfile(profile.id)
    const reader = await storage.initializeStorage()
    try {
      const claim = await claims.createClaim(writer.execute, { identifier: 'Before transaction' })
      await reader.openDatabase(`/profile-${profile.id}.sqlite3`)
      await reader.execute('PRAGMA query_only = ON')
      await writer.execute('BEGIN IMMEDIATE')
      await writer.execute("UPDATE profile_metadata SET label = 'After transaction' WHERE id = 1")
      await writer.execute("UPDATE claims SET identifier = 'After transaction' WHERE id = ?", [claim.id])
      const pending = reader.exportProfile(profile.id).then(
        (bytes) => ({ bytes, error: '' }),
        (error: unknown) => ({ bytes: undefined, error: error instanceof Error ? error.message : String(error) }),
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      await writer.execute('COMMIT')
      const result = await pending
      const bytes = result.bytes ?? await reader.exportProfile(profile.id)
      const current = await writer.execute('SELECT label FROM profile_metadata')
      return { bytes: Array.from(bytes), error: result.error, current }
    } finally { await reader.dispose(); await writer.dispose() }
  })
  if (snapshots.error) expect(snapshots.error).toMatch(/locked|busy|SQLite 5|SQLite 6/i)
  expect(snapshots.current).toEqual([{ label: 'After transaction' }])
  const snapshot = await openSnapshot(Uint8Array.from(snapshots.bytes))
  try {
    const profile = query(snapshot, 'SELECT label FROM profile_metadata')[0]
    const claim = query(snapshot, 'SELECT identifier FROM claims')[0]
    expect(['Before transaction', 'After transaction']).toContain(profile?.label)
    expect(claim?.identifier).toBe(profile?.label)
    expect(query(snapshot, 'PRAGMA integrity_check')[0]).toMatchObject({ integrity_check: 'ok' })
  } finally { snapshot.close() }

  const legacy = await page.evaluate(async () => {
    const path = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(path)
    const profile = await profiles.createProfile({ label: 'Legacy' })
    const session = await profiles.openProfile(profile.id)
    try {
      await session.execute('DROP TABLE activity_files')
      await session.execute('DROP TABLE activity_links')
      await session.execute('DROP TABLE activities')
      await session.execute('DROP TABLE simulated_sync_setup')
      await session.execute('DROP TABLE claims')
      await session.execute('PRAGMA user_version = 1')
    } finally { await session.dispose() }
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    const bytes = await profiles.exportProfile(profile.id)
    const reopened = await profiles.openProfile(profile.id)
    try { return { bytes: Array.from(bytes), version: await reopened.execute('PRAGMA user_version'), mode: reopened.access.mode } }
    finally { await reopened.dispose() }
  })
  expect(legacy.mode).toBe('read-only')
  expect(legacy.version).toEqual([{ user_version: 1 }])
  const legacyDb = await openSnapshot(Uint8Array.from(legacy.bytes))
  try {
    expect(query(legacyDb, 'PRAGMA user_version')[0]).toMatchObject({ user_version: 1 })
    expect(query(legacyDb, 'SELECT label FROM profile_metadata')[0]).toMatchObject({ label: 'Legacy' })
  } finally { legacyDb.close() }
})
