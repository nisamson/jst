import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'
import { openProfile } from './profiles'

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
  const [version] = await execute('PRAGMA user_version')
  if (version?.user_version === 1) {
    const [claimsTable] = await execute(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'claims'",
    )
    if (!claimsTable) return []
  }

  const rows = await execute(
    'SELECT id, identifier, created_at, claim_start_date FROM claims ORDER BY created_at DESC, id',
  )
  return rows.map(parseClaimRow)
}

export async function deleteClaim(execute: StorageSession['execute'], id: string): Promise<void> {
  if (!id.trim()) throw new Error('The claim ID is invalid.')
  await execute('DELETE FROM claims WHERE id = ?', [id])
  const [result] = await execute('SELECT changes() AS changes')
  if (result?.changes !== 1) {
    throw new Error('The selected claim no longer exists. Reload the claims overview and retry.')
  }
}

export async function deleteProfileClaim(profileId: string, claimId: string): Promise<void> {
  const session = await openProfile(profileId)
  try {
    await deleteClaim(session.execute, claimId)
  } finally {
    await session.dispose()
  }
}
