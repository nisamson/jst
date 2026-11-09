import { expect, it, vi } from 'vitest'
import { listClaimEvidence, readEvidenceFile, replaceEvidence } from './evidence'
import { saveActivity, saveProfileActivity } from './activities'
import { normalizeActivity } from './activity-model'
import type { PreparedEvidence } from './evidence-model'
import type { StorageSession } from './local-storage'
import { openProfile } from './profiles'

vi.mock('./profiles', () => ({ openProfile: vi.fn() }))
const activityId = crypto.randomUUID()
const file = { id: crypto.randomUUID(), name: 'receipt.eml', type: 'message/rfc822', size: 4, description: '' }
const input = { kind: 'other_activity' as const, activity_date: '2026-01-01', activity_description: 'Workshop' }

it('does not access evidence tables on older read-only schemas', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([{ user_version: 5 }])
  expect(await listClaimEvidence(execute, 'claim')).toEqual(new Map())
  expect(execute).toHaveBeenCalledTimes(1)
})

it('requires profile/claim/activity/file context for retrieval and validates complete bytes', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([{ ...file, bytes: new Uint8Array([1, 2, 3, 4]) }])
  expect((await readEvidenceFile(execute, 'claim', activityId, file.id)).bytes).toEqual(new Uint8Array([1, 2, 3, 4]))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('WHERE a.claim_id = ? AND a.id = ? AND e.id = ?'), ['claim', activityId, file.id])
  execute.mockResolvedValue([])
  await expect(readEvidenceFile(execute, 'other-claim', activityId, file.id)).rejects.toThrow(/unavailable/)
  execute.mockResolvedValue([{ ...file, bytes: new Uint8Array([1]) }])
  await expect(readEvidenceFile(execute, 'claim', activityId, file.id)).rejects.toThrow(/completely/)
})

it('rejects foreign retained files before changing any evidence', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => sql.startsWith('SELECT id FROM activities') ? [{ id: activityId }] : [])
  await expect(replaceEvidence(execute, 'claim', activityId, { links: [], files: [file] })).rejects.toThrow(/retained file/)
  expect(execute.mock.calls.some(([sql]) => /^(DELETE|INSERT|UPDATE)/.test(sql))).toBe(false)
})

it('updates retained descriptions without reading or rewriting file blobs', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM activities')) return [{ id: activityId }]
    if (sql.startsWith('SELECT id, name')) return [file]
    return []
  })
  const result = await replaceEvidence(execute, 'claim', activityId, { links: [], files: [{ ...file, description: ' Original email ' }] })
  expect(result.files[0].description).toBe('Original email')
  expect(execute.mock.calls.every(([sql]) => !sql.includes('bytes'))).toBe(true)
})

it('rolls back the activity save if any evidence insert fails, including quota/full errors', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: 'claim' }]
    if (sql.startsWith('SELECT id FROM activities')) return [{ id: activityId }]
    if (sql.startsWith('INSERT INTO activity_files')) throw new Error('SQLITE_FULL: database or disk is full')
    return []
  })
  const evidence: PreparedEvidence = { links: [], files: [{ ...file, bytes: new Uint8Array(4) }] }
  await expect(saveActivity(execute, 'claim', input, undefined, evidence)).rejects.toThrow(/SQLITE_FULL/)
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
  expect(execute).not.toHaveBeenCalledWith('COMMIT')
})

it('rejects read-only activity/evidence changes at the profile service boundary', async () => {
  const execute = vi.fn<StorageSession['execute']>()
  const dispose = vi.fn().mockResolvedValue(undefined)
  vi.mocked(openProfile).mockResolvedValue({
    execute, dispose, profile: { id: 'profile', label: 'Read only', createdAt: '' },
    access: { mode: 'read-only', persistence: 'denied', syncConnected: false },
    saveSimulatedSyncState: vi.fn(),
  })
  await expect(saveProfileActivity('profile', 'claim', input, activityId, { links: [], files: [] })).rejects.toThrow(/read-only/)
  expect(execute).not.toHaveBeenCalled()
  expect(dispose).toHaveBeenCalled()
})

it('preserves evidence when legacy activity callers omit an evidence draft', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: 'claim' }]
    if (sql.startsWith('UPDATE activities')) return [{
      ...normalizeActivity(input), id: activityId, claim_id: 'claim',
      created_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z',
    }]
    return []
  })
  await saveActivity(execute, 'claim', input, activityId)
  expect(execute.mock.calls.some(([sql]) => sql.includes('activity_files') || sql.includes('activity_links'))).toBe(false)
})
