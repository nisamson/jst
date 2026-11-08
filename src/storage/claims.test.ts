import { expect, it, vi } from 'vitest'
import type { SqlValue } from '@sqlite.org/sqlite-wasm'
import { listClaims } from './claims'
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
    }),
    row({
      id: 'claim-1',
      identifier: 'Claim 2025',
      created_at: '2025-02-01T12:00:00.000Z',
      claim_start_date: null,
    }),
  ]
  const execute: StorageSession['execute'] = vi.fn(async () => rows)

  await expect(listClaims(execute)).resolves.toEqual([
    {
      id: 'claim-2',
      identifier: 'Claim 2026',
      createdAt: '2026-02-01T12:00:00.000Z',
      claimStartDate: '2026-01-15',
    },
    {
      id: 'claim-1',
      identifier: 'Claim 2025',
      createdAt: '2025-02-01T12:00:00.000Z',
    },
  ])
  expect(execute).toHaveBeenCalledWith(
    'SELECT id, identifier, created_at, claim_start_date FROM claims ORDER BY created_at DESC, id',
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
