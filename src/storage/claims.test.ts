import { expect, it, vi } from 'vitest'
import type { SqlValue } from '@sqlite.org/sqlite-wasm'
import { createClaim, deleteClaim, listClaims, normalizeClaimInput, updateClaim } from './claims'
import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'

function row(values: Record<string, SqlValue>): SqlRow {
  return values
}

it('reads claim metadata including an optional claim start date', async () => {
  const rows = [
    row({
      id: 'claim-2',
      identifier: 'Claim 2026',
      created_at: '2026-02-01T12:00:00.000Z',
      claim_start_date: '2026-01-15',
      overview: 'My notes\nSecond line',
    }),
    row({
      id: 'claim-1',
      identifier: 'Claim 2025',
      created_at: '2025-02-01T12:00:00.000Z',
      claim_start_date: null,
      overview: null,
    }),
  ]
  const execute: StorageSession['execute'] = vi.fn(async () => rows)

  await expect(listClaims(execute)).resolves.toEqual([
    {
      id: 'claim-2',
      identifier: 'Claim 2026',
      createdAt: '2026-02-01T12:00:00.000Z',
      claimStartDate: '2026-01-15',
      overview: 'My notes\nSecond line',
    },
    {
      id: 'claim-1',
      identifier: 'Claim 2025',
      createdAt: '2025-02-01T12:00:00.000Z',
    },
  ])
  expect(execute).toHaveBeenCalledWith(
    'SELECT id, identifier, created_at, claim_start_date, overview FROM claims ORDER BY created_at DESC, id',
  )
})

it('rejects claim rows with invalid metadata', async () => {
  const execute: StorageSession['execute'] = vi.fn(async () => [
    row({
      id: 'claim-1',
      identifier: 'Claim',
      created_at: '2026-02-01T12:00:00.000Z',
      claim_start_date: 42,
    }),
  ])

  await expect(listClaims(execute)).rejects.toThrow(/invalid metadata/)
})

it('treats a version-one profile without a claims table as an empty overview', async () => {
  const execute: StorageSession['execute'] = vi.fn(async (sql) => {
    if (sql === 'PRAGMA user_version') return [row({ user_version: 1 })]
    if (sql.startsWith('SELECT name FROM sqlite_schema')) return []
    throw new Error(`Unexpected SQL: ${sql}`)
  })

  await expect(listClaims(execute)).resolves.toEqual([])
  expect(execute).not.toHaveBeenCalledWith(
    'SELECT id, identifier, created_at, claim_start_date, overview FROM claims ORDER BY created_at DESC, id',
  )
})

it('deletes a claim by stable ID and reports when it no longer exists', async () => {
  const execute: StorageSession['execute'] = vi.fn(async (sql) => {
    if (sql === 'SELECT changes() AS changes') return [row({ changes: 1 })]
    return []
  })

  await deleteClaim(execute, 'stable-claim-id')

  expect(execute).toHaveBeenNthCalledWith(1, 'BEGIN IMMEDIATE')
  expect(execute).toHaveBeenNthCalledWith(2, 'DELETE FROM claims WHERE id = ?', ['stable-claim-id'])
  expect(execute).toHaveBeenNthCalledWith(3, 'SELECT changes() AS changes')
  expect(execute).toHaveBeenLastCalledWith('COMMIT')

  const missingClaim: StorageSession['execute'] = vi.fn(async () => [row({ changes: 0 })])
  await expect(deleteClaim(missingClaim, 'already-deleted')).rejects.toThrow(/no longer exists/i)
  await expect(deleteClaim(execute, '  ')).rejects.toThrow(/invalid/i)
})

it('normalizes identifiers and optional dates without rejecting duplicates or changing internal whitespace', () => {
  expect(normalizeClaimInput({ identifier: '  My  claim \n', claimStartDate: ' 2024-02-29 ' }))
    .toEqual({ identifier: 'My  claim', claimStartDate: '2024-02-29' })
  expect(normalizeClaimInput({ identifier: 'My  claim', claimStartDate: ' \t ' }))
    .toEqual({ identifier: 'My  claim' })
  expect(() => normalizeClaimInput({ identifier: '\n\t' })).toThrow(/identifier/)
})

it.each(['2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '0000-01-01', '2026-01-00', '26-01-01', '2026-1-01', '2026-01-01T00:00:00Z'])(
  'rejects invalid claim calendar date %s before issuing SQL',
  async (claimStartDate) => {
    const execute = vi.fn<StorageSession['execute']>()
    await expect(createClaim(execute, { identifier: 'Claim', claimStartDate })).rejects.toThrow(/real claim start date/)
    expect(execute).not.toHaveBeenCalled()
  },
)

it.each(['2000-02-29', '0001-01-01', '9999-12-31'])('accepts real calendar date %s without timezone conversion', (claimStartDate) => {
  expect(normalizeClaimInput({ identifier: 'Claim', claimStartDate }).claimStartDate).toBe(claimStartDate)
})

it('creates separate stable records for matching identifiers using bound values', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([])
  const first = await createClaim(execute, { identifier: " Same ' claim ", overview: '  My notes\n  More notes  ' })
  const second = await createClaim(execute, { identifier: "Same ' claim" })

  expect(first.id).not.toBe(second.id)
  expect(first.identifier).toBe("Same ' claim")
  expect(execute).toHaveBeenCalledWith(
    'INSERT INTO claims (id, identifier, created_at, claim_start_date, overview) VALUES (?, ?, ?, ?, ?)',
    [first.id, first.identifier, first.createdAt, null, 'My notes\n  More notes'],
  )
})

it('updates only the selected ID, clearing the optional date while preserving identity and creation time', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => sql.startsWith('UPDATE')
    ? [row({ id: 'existing-id', identifier: 'Updated', created_at: '2025-01-01T00:00:00.000Z', claim_start_date: null, overview: null })]
    : [])
  const saved = await updateClaim(execute, 'existing-id', { identifier: ' Updated ', claimStartDate: '', overview: ' \n ' })
  expect(saved).toEqual({ id: 'existing-id', identifier: 'Updated', createdAt: '2025-01-01T00:00:00.000Z' })
  expect(execute).toHaveBeenCalledWith(
    'UPDATE claims SET identifier = ?, claim_start_date = ?, overview = ? WHERE id = ? RETURNING id, identifier, created_at, claim_start_date, overview',
    ['Updated', null, null, 'existing-id'],
  )
  expect(execute).toHaveBeenLastCalledWith('COMMIT')
})

it('reads legacy claims without requiring or migrating the overview column', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => sql === 'PRAGMA user_version'
    ? [row({ user_version: 4 })]
    : [row({ id: 'legacy', identifier: 'Legacy', created_at: '2026-01-01T00:00:00.000Z', claim_start_date: null, overview: null })])
  await expect(listClaims(execute)).resolves.toEqual([
    { id: 'legacy', identifier: 'Legacy', createdAt: '2026-01-01T00:00:00.000Z' },
  ])
  expect(execute).toHaveBeenLastCalledWith(
    'SELECT id, identifier, created_at, claim_start_date, NULL AS overview FROM claims ORDER BY created_at DESC, id',
  )
})

it('rejects overview values with invalid storage types', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([
    row({ id: 'claim', identifier: 'Claim', created_at: '2026-01-01T00:00:00.000Z', claim_start_date: null, overview: 42 }),
  ])
  await expect(listClaims(execute)).rejects.toThrow(/invalid metadata/)
})

it('rolls back missing updates and failed mutations instead of presenting success', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([])
  await expect(updateClaim(execute, 'missing-id', { identifier: 'Changed' })).rejects.toThrow(/no longer exists/)
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
  execute.mockImplementation(async (sql) => {
    if (sql.startsWith('INSERT') || sql.startsWith('DELETE')) throw new Error('disk full')
    return []
  })
  await expect(createClaim(execute, { identifier: 'Claim' })).rejects.toThrow('disk full')
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
  await expect(deleteClaim(execute, 'claim-id')).rejects.toThrow('disk full')
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
})
