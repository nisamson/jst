import { expect, test } from '@playwright/test'

test('SQLite records survive database reopen, worker replacement, and browser reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const beforeReload = await page.evaluate(async () => {
    const modulePath = '/src/storage/local-storage.ts'
    const { initializeStorage }: typeof import('../../src/storage/local-storage') = await import(modulePath)
    const storage = await initializeStorage()
    try {
      await storage.openDatabase('/persistence-proof.sqlite3', { create: true })
      await storage.execute('CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
      await storage.execute('INSERT INTO proof (value) VALUES (?)', ["Persistent 'SQLite' record"])
      await storage.closeDatabase()
      await storage.openDatabase('/persistence-proof.sqlite3')
      return await storage.execute('SELECT value FROM proof')
    } finally {
      await storage.dispose()
    }
  })
  expect(beforeReload).toEqual([{ value: "Persistent 'SQLite' record" }])

  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  const afterReload = await page.evaluate(async () => {
    const modulePath = '/src/storage/local-storage.ts'
    const { initializeStorage }: typeof import('../../src/storage/local-storage') = await import(modulePath)
    const storage = await initializeStorage()
    try {
      await storage.openDatabase('/persistence-proof.sqlite3')
      const version = await storage.execute('SELECT sqlite_version() AS version')
      const records = await storage.execute('SELECT value FROM proof')
      await storage.execute('DROP TABLE proof')
      return { records, version }
    } finally {
      await storage.dispose()
    }
  })
  expect(afterReload.records).toEqual(beforeReload)
  expect(afterReload.version[0].version).toMatch(/^3\./)
})

test('database open and SQL failures preserve existing records without a fallback', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/storage/local-storage.ts'
    const { initializeStorage }: typeof import('../../src/storage/local-storage') = await import(modulePath)
    const storage = await initializeStorage()
    const errors: string[] = []
    try {
      for (const filename of ['/missing.sqlite3', ':memory:']) {
        try {
          await storage.openDatabase(filename)
        } catch (error) {
          errors.push(String(error))
        }
      }
      await storage.openDatabase('/failure-proof.sqlite3', { create: true })
      await storage.execute('CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT UNIQUE)')
      await storage.execute('INSERT INTO proof (value) VALUES (?)', ['original'])
      try {
        await storage.execute('INSERT INTO proof (value) VALUES (?)', ['original'])
      } catch (error) {
        errors.push(String(error))
      }
      const records = await storage.execute('SELECT value FROM proof')
      await storage.execute('DROP TABLE proof')
      return { errors, records }
    } finally {
      await storage.dispose()
    }
  })
  expect(result.errors).toHaveLength(3)
  expect(result.errors[0]).toMatch(/SQLITE_(CANTOPEN|IOERR)/)
  expect(result.errors[1]).toContain('absolute database filename')
  expect(result.errors[2]).toMatch(/UNIQUE|constraint/i)
  expect(result.records).toEqual([{ value: 'original' }])
})

test('diagnostic writes and cleanup leave an unrelated database unchanged', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.evaluate(async () => {
    const modulePath = '/src/storage/local-storage.ts'
    const { initializeStorage }: typeof import('../../src/storage/local-storage') = await import(modulePath)
    const storage = await initializeStorage()
    try {
      await storage.openDatabase('/unrelated-profile.sqlite3', { create: true })
      await storage.execute('CREATE TABLE records (value TEXT NOT NULL)')
      await storage.execute('INSERT INTO records (value) VALUES (?)', ['preserve this record'])
    } finally {
      await storage.dispose()
    }
  })
  await page.getByRole('link', { name: 'Storage diagnostics' }).click()
  await page.getByRole('button', { name: 'Write and reopen test record' }).click()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('verified after closing and reopening')
  await page.getByRole('button', { name: 'Clear diagnostic test data' }).click()
  await expect(page.getByRole('status', { name: 'Diagnostic result' })).toContainText('test data cleared')
  const records = await page.evaluate(async () => {
    const modulePath = '/src/storage/local-storage.ts'
    const { initializeStorage }: typeof import('../../src/storage/local-storage') = await import(modulePath)
    const storage = await initializeStorage()
    try {
      await storage.openDatabase('/unrelated-profile.sqlite3')
      return await storage.execute('SELECT value FROM records')
    } finally {
      await storage.dispose()
    }
  })
  expect(records).toEqual([{ value: 'preserve this record' }])
})
