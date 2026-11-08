import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'

export interface Claim {
  id: string
  identifier: string
  createdAt: string
  claimStartDate?: string
}

function parseClaimRow(row: SqlRow): Claim {
  if (
    typeof row.id !== 'string'
    || typeof row.identifier !== 'string'
    || typeof row.created_at !== 'string'
    || (row.claim_start_date !== null && typeof row.claim_start_date !== 'string')
  ) {
    throw new Error('The profile contains claim records with invalid metadata.')
  }

  return {
    id: row.id,
    identifier: row.identifier,
    createdAt: row.created_at,
    ...(typeof row.claim_start_date === 'string' ? { claimStartDate: row.claim_start_date } : {}),
  }
}

export async function listClaims(execute: StorageSession['execute']): Promise<Claim[]> {
  const rows = await execute(
    'SELECT id, identifier, created_at, claim_start_date FROM claims ORDER BY created_at DESC, id',
  )
  return rows.map(parseClaimRow)
}
