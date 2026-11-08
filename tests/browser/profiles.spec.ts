import { expect, test } from '@playwright/test'

test('separate local profiles are discoverable and isolated after reload', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => true })
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')

  const beforeReload = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const first = await profiles.createProfile({ label: 'Profile one', realName: 'Alex Example' })
    const second = await profiles.createProfile({ label: 'Profile two' })

    const firstSession = await profiles.openProfile(first.id)
    try {
      await firstSession.execute('CREATE TABLE private_records (value TEXT NOT NULL)')
      await firstSession.execute('INSERT INTO private_records (value) VALUES (?)', ['first profile data'])
    } finally {
      await firstSession.dispose()
    }

    const secondSession = await profiles.openProfile(second.id)
    try {
      await secondSession.execute('CREATE TABLE private_records (value TEXT NOT NULL)')
      await secondSession.execute('INSERT INTO private_records (value) VALUES (?)', ['second profile data'])
    } finally {
      await secondSession.dispose()
    }

    return { first, second, listing: await profiles.listProfiles() }
  })

  expect(beforeReload.listing).toEqual({
    profiles: [beforeReload.first, beforeReload.second],
    errors: [],
  })
  expect(beforeReload.first.id).not.toBe(beforeReload.second.id)

  await page.reload()
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  const afterReload = await page.evaluate(async (ids) => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const listing = await profiles.listProfiles()
    const records = []
    for (const id of ids) {
      const session = await profiles.openProfile(id)
      try {
        records.push(await session.execute('SELECT value FROM private_records'))
      } finally {
        await session.dispose()
      }
    }
    return { listing, records }
  }, [beforeReload.first.id, beforeReload.second.id])

  expect(afterReload.listing.profiles).toEqual([beforeReload.first, beforeReload.second])
  expect(afterReload.listing.errors).toEqual([])
  expect(afterReload.records).toEqual([
    [{ value: 'first profile data' }],
    [{ value: 'second profile data' }],
  ])
})

test('unverified profile sessions allow reads but reject writes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { configurable: true, value: async () => false })
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: async () => false })
  })
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    const profile = await profiles.createProfile({ label: 'Read-only profile' })
    const session = await profiles.openProfile(profile.id)
    try {
      let writeError = ''
      try {
        await session.execute(
          'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?)',
          ['blocked-claim', 'Blocked claim', '2026-01-01T00:00:00.000Z', null],
        )
      } catch (error) {
        writeError = error instanceof Error ? error.message : String(error)
      }
      const [count] = await session.execute('SELECT COUNT(*) AS count FROM claims')
      return { mode: session.access.mode, persistence: session.access.persistence, writeError, count: count?.count }
    } finally {
      await session.dispose()
    }
  })

  expect(result).toEqual({
    mode: 'read-only',
    persistence: 'denied',
    writeError: expect.stringMatching(/readonly/i),
    count: 0,
  })
})

test('profile creation failure is reported and can be retried without a false profile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Local SQLite storage is ready.')
  await page.route('**/*.wasm', (route) => route.abort())

  const failedCreation = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    try {
      await profiles.createProfile({ label: 'Retry me' })
      return { failed: false, message: '' }
    } catch (error) {
      return { failed: true, message: String(error) }
    }
  })
  expect(failedCreation.failed).toBe(true)
  expect(failedCreation.message).toMatch(/worker|storage|sqlite|wasm/i)

  await page.unroute('**/*.wasm')
  const retry = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    return { created: await profiles.createProfile({ label: 'Retry me' }), listing: await profiles.listProfiles() }
  })
  expect(retry.listing).toEqual({ profiles: [retry.created], errors: [] })
})

test('unsupported OPFS storage blocks profile access with an explanation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: undefined })
  })
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const modulePath = '/src/storage/profiles.ts'
    const profiles: typeof import('../../src/storage/profiles') = await import(modulePath)
    try {
      await profiles.createProfile({ label: 'Unsupported profile' })
      return ''
    } catch (error) {
      return String(error)
    }
  })
  expect(result).toMatch(/OPFS/)
})
