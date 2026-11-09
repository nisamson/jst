import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'
import { openProfile } from './profiles'
import { isCalendarDate } from './calendar-date'

export interface ClaimInput {
  identifier: string
  claimStartDate?: string
  overview?: string
}

export function normalizeClaimInput(input: ClaimInput): ClaimInput {
  const identifier = input.identifier.trim()
  if (!identifier) throw new Error('Enter a claim identifier.')
  const claimStartDate = input.claimStartDate?.trim()
  if (claimStartDate && !isCalendarDate(claimStartDate)) {
    throw new Error('Enter a real claim start date in YYYY-MM-DD format, or leave it blank.')
  }
  const overview = input.overview?.trim()
  return { identifier, ...(claimStartDate ? { claimStartDate } : {}), ...(overview ? { overview } : {}) }
}

export interface Claim {
  id: string
  identifier: string
  createdAt: string
  claimStartDate?: string
  overview?: string
}

async function writeClaim<T>(execute: StorageSession['execute'], operation: () => Promise<T>): Promise<T> {
  await execute('BEGIN IMMEDIATE')
  try {
    const result = await operation()
    await execute('COMMIT')
    return result
  } catch (error) {
    try {
      await execute('ROLLBACK')
    } catch (rollbackError) {
      throw new Error('The claim operation failed and rollback could not be completed. Reopen the profile before retrying.', { cause: rollbackError })
    }
    throw error
  }
}

function parseClaimRow(row: SqlRow): Claim {
  if (
    typeof row.id !== 'string'
    || typeof row.identifier !== 'string'
    || typeof row.created_at !== 'string'
    || (row.claim_start_date !== null && typeof row.claim_start_date !== 'string')
    || (row.overview !== null && typeof row.overview !== 'string')
  ) {
    throw new Error('The profile contains claim records with invalid metadata.')
  }

  return {
    id: row.id,
    identifier: row.identifier,
    createdAt: row.created_at,
    ...(typeof row.claim_start_date === 'string' ? { claimStartDate: row.claim_start_date } : {}),
    ...(typeof row.overview === 'string' ? { overview: row.overview } : {}),
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

  const overviewColumn = typeof version?.user_version === 'number' && version.user_version < 5
    ? 'NULL AS overview'
    : 'overview'
  const rows = await execute(
    `SELECT id, identifier, created_at, claim_start_date, ${overviewColumn} FROM claims ORDER BY created_at DESC, id`,
  )
  return rows.map(parseClaimRow)
}

export async function deleteClaim(execute: StorageSession['execute'], id: string): Promise<void> {
  if (!id.trim()) throw new Error('The claim ID is invalid.')
  await writeClaim(execute, async () => {
    await execute('DELETE FROM claims WHERE id = ?', [id])
    const [result] = await execute('SELECT changes() AS changes')
    if (result?.changes !== 1) {
      throw new Error('The selected claim no longer exists. Reload the claims overview and retry.')
    }
  })
}

export async function deleteProfileClaim(profileId: string, claimId: string): Promise<void> {
  const session = await openProfile(profileId)
  try {
    if (session.access.mode !== 'read-write') throw new Error('This profile is read-only. Claim changes are blocked.')
    await deleteClaim(session.execute, claimId)
  } finally {
    await session.dispose()
  }
}

export async function createClaim(execute: StorageSession['execute'], input: ClaimInput): Promise<Claim> {
  const normalized = normalizeClaimInput(input)
  const claim = { ...normalized, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  await writeClaim(execute, () => execute(
    'INSERT INTO claims (id, identifier, created_at, claim_start_date, overview) VALUES (?, ?, ?, ?, ?)',
    [claim.id, claim.identifier, claim.createdAt, claim.claimStartDate ?? null, claim.overview ?? null],
  ))
  return claim
}

export async function updateClaim(execute: StorageSession['execute'], id: string, input: ClaimInput): Promise<Claim> {
  if (!id.trim()) throw new Error('The claim ID is invalid.')
  const normalized = normalizeClaimInput(input)
  return writeClaim(execute, async () => {
    const rows = await execute(
      'UPDATE claims SET identifier = ?, claim_start_date = ?, overview = ? WHERE id = ? RETURNING id, identifier, created_at, claim_start_date, overview',
      [normalized.identifier, normalized.claimStartDate ?? null, normalized.overview ?? null, id],
    )
    if (!rows[0]) throw new Error('The selected claim no longer exists. Reload the claims overview and retry.')
    return parseClaimRow(rows[0])
  })
}

export async function saveProfileClaim(profileId: string, input: ClaimInput, claimId?: string): Promise<Claim> {
  normalizeClaimInput(input)
  const session = await openProfile(profileId)
  try {
    if (session.access.mode !== 'read-write') throw new Error('This profile is read-only. Claim changes are blocked.')
    return claimId === undefined
      ? await createClaim(session.execute, input)
      : await updateClaim(session.execute, claimId, input)
  } finally {
    await session.dispose()
  }
}
