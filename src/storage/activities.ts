import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'
import { openProfile } from './profiles'
import { activityTextFields, normalizeActivity } from './activity-model'
import type { Activity, ActivityInput } from './activity-model'
import { listClaimEvidence, replaceEvidence } from './evidence'
import { emptyEvidence, prepareEvidence } from './evidence-model'
import type { EvidenceDraft, PreparedEvidence } from './evidence-model'

const columns = [
  'id', 'claim_id', 'activity_date', 'kind', 'created_at', 'updated_at',
  'contact_method', 'contact_type', ...activityTextFields,
] as const
const editableColumns = ['activity_date', 'kind', 'updated_at', 'contact_method', 'contact_type', ...activityTextFields] as const

function validateId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('The activity ID is invalid.')
  }
}

function validateTimestamp(value: string) {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('The activity contains an invalid timestamp.')
  }
}

function parseActivity(row: SqlRow, claimId: string): Activity {
  if (!columns.every((column) => typeof row[column] === 'string'
    || (row[column] === null && (activityTextFields.includes(column as typeof activityTextFields[number])
      || column === 'contact_method' || column === 'contact_type')))) {
    throw new Error('The profile contains an activity with invalid field types.')
  }
  const activity = row as unknown as Activity
  validateId(activity.id)
  validateTimestamp(activity.created_at)
  validateTimestamp(activity.updated_at)
  if (activity.claim_id !== claimId) throw new Error('The activity does not belong to this claim.')
  const normalized = normalizeActivity(activity)
  if (Object.entries(normalized).some(([field, value]) => row[field] !== value)) {
    throw new Error('The profile contains activity details that are not normalized or applicable to their kind.')
  }
  return activity
}

async function requireClaim(execute: StorageSession['execute'], claimId: string) {
  if (!claimId.trim()) throw new Error('The claim ID is invalid.')
  const [claim] = await execute('SELECT id FROM claims WHERE id = ?', [claimId])
  if (!claim) throw new Error('The selected claim no longer exists. Reopen the claims overview.')
}

async function transaction<T>(execute: StorageSession['execute'], action: () => Promise<T>) {
  await execute('BEGIN IMMEDIATE')
  try {
    const result = await action()
    await execute('COMMIT')
    return result
  } catch (error) {
    try { await execute('ROLLBACK') } catch (rollbackError) {
      throw new Error('The activity operation failed and rollback could not complete. Reopen the profile before retrying.', { cause: rollbackError })
    }
    throw error
  }
}

export async function listActivities(execute: StorageSession['execute'], claimId: string): Promise<Activity[]> {
  await requireClaim(execute, claimId)
  const [version] = await execute('PRAGMA user_version')
  if (typeof version?.user_version !== 'number' || version.user_version < 4) return []
  const rows = await execute(
    `SELECT ${columns.join(', ')} FROM activities WHERE claim_id = ? ORDER BY activity_date DESC, created_at DESC, id`,
    [claimId],
  )
  const evidence = await listClaimEvidence(execute, claimId)
  return rows.map((row) => ({ ...parseActivity(row, claimId), evidence: evidence.get(String(row.id)) ?? emptyEvidence() }))
}

export async function saveActivity(
  execute: StorageSession['execute'], claimId: string, input: ActivityInput, id?: string, evidence?: PreparedEvidence,
): Promise<Activity> {
  const details = normalizeActivity(input)
  if (id !== undefined) validateId(id)
  return transaction(execute, async () => {
    await requireClaim(execute, claimId)
    const now = new Date().toISOString()
    if (id !== undefined) {
      const values = { ...details, updated_at: now }
      const [row] = await execute(
        `UPDATE activities SET ${editableColumns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND claim_id = ? RETURNING ${columns.join(', ')}`,
        [...editableColumns.map((column) => values[column] ?? null), id, claimId],
      )
      if (!row) throw new Error('The selected activity no longer exists in this claim. Reload activities and retry.')
      const saved = parseActivity(row, claimId)
      return evidence ? { ...saved, evidence: await replaceEvidence(execute, claimId, saved.id, evidence) } : saved
    }
    const activity: Activity = { ...details, id: crypto.randomUUID(), claim_id: claimId, created_at: now, updated_at: now }
    await execute(
      `INSERT INTO activities (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => activity[column] ?? null),
    )
    return evidence ? { ...activity, evidence: await replaceEvidence(execute, claimId, activity.id, evidence) } : activity
  })
}

export async function deleteActivity(execute: StorageSession['execute'], claimId: string, id: string) {
  validateId(id)
  await transaction(execute, async () => {
    await requireClaim(execute, claimId)
    const rows = await execute('DELETE FROM activities WHERE id = ? AND claim_id = ? RETURNING id', [id, claimId])
    if (!rows.length) throw new Error('The selected activity no longer exists in this claim. Reload activities and retry.')
  })
}

export async function loadProfileActivities(profileId: string, claimId: string) {
  const session = await openProfile(profileId)
  try {
    return { activities: await listActivities(session.execute, claimId), readOnly: session.access.mode === 'read-only' }
  } finally {
    await session.dispose()
  }
}

export async function saveProfileActivity(profileId: string, claimId: string, input: ActivityInput, id?: string, evidence?: EvidenceDraft) {
  normalizeActivity(input)
  const prepared = evidence ? await prepareEvidence(evidence) : undefined
  const session = await openProfile(profileId)
  try {
    if (session.access.mode !== 'read-write') throw new Error('This profile is read-only. Activity changes are blocked.')
    return await saveActivity(session.execute, claimId, input, id, prepared)
  } catch (failure) {
    if (failure instanceof Error && /SQLITE_FULL|quota|disk.*full|not enough.*space/i.test(failure.message)) {
      throw new Error('There is not enough browser or device storage to save this activity. Remove some pending files or free storage, then retry. Existing records have not been changed.', { cause: failure })
    }
    throw failure
  } finally {
    await session.dispose()
  }
}

export async function deleteProfileActivity(profileId: string, claimId: string, id: string) {
  const session = await openProfile(profileId)
  try {
    if (session.access.mode !== 'read-write') throw new Error('This profile is read-only. Activity changes are blocked.')
    await deleteActivity(session.execute, claimId, id)
  } finally {
    await session.dispose()
  }
}
