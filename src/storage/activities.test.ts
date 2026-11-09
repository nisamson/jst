import { expect, it, vi } from 'vitest'
import { activityTextFields, activityWarnings, localCalendarDate, normalizeActivity } from './activity-model'
import type { ActivityInput } from './activity-model'
import { deleteActivity, listActivities, saveActivity } from './activities'
import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'

const claimId = 'legacy-stable-claim-id'
const recordId = '11111111-1111-4111-8111-111111111111'
const employer: ActivityInput = {
  activity_date: '2026-01-01', kind: 'employer_contact',
  job_title_or_reference: 'Developer', employer_name: 'Example',
  contact_method: 'email', contact_type: 'application_resume', employer_website_or_email: 'example.test',
}
const other: ActivityInput = { activity_date: '2026-01-01', kind: 'other_activity', activity_description: 'Practice interview' }

function storedRow(input: ActivityInput = other): SqlRow {
  return {
    ...normalizeActivity(input), id: recordId, claim_id: claimId,
    created_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z',
  } as SqlRow
}

it('normalizes text and clears every inapplicable field when changing kind', () => {
  const saved = normalizeActivity({
    ...employer, kind: 'other_activity', activity_description: '  Notes\n  preserve indentation  ',
    documentation_description: ' \t ', worksource_city: 'Old city',
  })
  expect(saved.activity_description).toBe('Notes\n  preserve indentation')
  expect(saved.documentation_description).toBeNull()
  for (const field of activityTextFields.filter((item) => item !== 'activity_description')) {
    expect(saved[field]).toBeNull()
  }
  expect(saved.contact_method).toBeNull()
  expect(saved.contact_type).toBeNull()
})

it.each([
  { ...employer, employer_name: ' \n ' },
  { ...employer, job_title_or_reference: '' },
  { ...employer, contact_method: null },
  { ...employer, contact_type: null },
  { ...employer, contact_method: 'other' as const, contact_method_other: '  ' },
  { ...employer, employer_website_or_email: ' ', employer_city: 'Seattle', employer_state: 'WA' },
  { ...other, activity_description: '' },
  { ...other, kind: 'worksource_activity' as const, activity_description: ' \n ' },
  { ...other, activity_date: '2025-02-29' },
  { ...other, activity_date: '2026-04-31' },
  { ...other, activity_date: '2026-1-01' },
  { ...other, kind: 'unsupported' as ActivityInput['kind'] },
  { ...employer, contact_method: 'fax' as ActivityInput['contact_method'] },
  { ...employer, contact_type: 'email' as ActivityInput['contact_type'] },
])('rejects invalid activity details before opening a write transaction: %j', async (input) => {
  const execute = vi.fn<StorageSession['execute']>()
  await expect(saveActivity(execute, claimId, input)).rejects.toThrow()
  expect(execute).not.toHaveBeenCalled()
})

it.each(['employer_address', 'employer_website_or_email', 'employer_phone'] as const)(
  'accepts flexible employer contact text in %s without requiring the other options', (field) => {
    expect(normalizeActivity({ ...employer, employer_website_or_email: null, [field]: ' Flexible text ' })[field]).toBe('Flexible text')
  },
)

it('allows other methods, normalizes worksource fields, and clears unrelated details', () => {
  const contact = normalizeActivity({ ...employer, contact_method: 'other', contact_method_other: '  Conference chat  ', activity_description: 'Old notes' })
  expect(contact.contact_method_other).toBe('Conference chat')
  expect(contact.activity_description).toBeNull()
  expect(normalizeActivity({ ...contact, contact_method: 'phone' }).contact_method_other).toBeNull()
  const worksource = normalizeActivity({ ...other, kind: 'worksource_activity', worksource_city: ' Seattle ', documentation_description: ' Email ' })
  expect(worksource.worksource_city).toBe('Seattle')
  expect(worksource.documentation_description).toBe('Email')
})

it('derives non-blocking warnings from calendar dates and optional evidence without ESD decisions', () => {
  const input = { ...other, activity_date: '2099-01-01' }
  expect(activityWarnings(input, '2026-01-01')).toHaveLength(2)
  expect(() => normalizeActivity(input)).not.toThrow()
  expect(activityWarnings({ ...input, activity_date: '2026-01-01', documentation_description: 'Email' }, '2026-01-01')).toEqual([])
  expect(activityWarnings(employer, '2026-01-01')).toEqual([])
  expect(localCalendarDate(new Date(2026, 0, 2, 23, 30))).toBe('2026-01-02')
})

it('creates matching records with distinct IDs, equal creation/edit timestamps, and bound values', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => sql.startsWith('SELECT id FROM claims')
    ? [{ id: claimId }] : [])
  const first = await saveActivity(execute, claimId, other)
  const second = await saveActivity(execute, claimId, other)
  expect(first.id).not.toBe(second.id)
  expect(first.created_at).toBe(first.updated_at)
  expect(first.claim_id).toBe(claimId)
  const insert = execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO activities'))
  expect(insert?.[0]).not.toContain('Practice interview')
  expect(insert?.[1]).toContain('Practice interview')
  expect(execute).toHaveBeenLastCalledWith('COMMIT')
})

it('updates the complete kind replacement within its owning claim and preserves immutable fields', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql, bind) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: claimId }]
    if (sql.startsWith('UPDATE activities')) {
      expect(sql).toContain('WHERE id = ? AND claim_id = ?')
      expect(sql).not.toContain('SET id =')
      expect(sql).not.toContain('created_at =')
      expect(bind).toContain(recordId)
      expect(bind).toContain(claimId)
      return [storedRow(other)]
    }
    return []
  })
  const saved = await saveActivity(execute, claimId, { ...employer, ...other }, recordId)
  expect(saved.created_at).toBe('2026-01-01T12:00:00.000Z')
  expect(saved.id).toBe(recordId)
  expect(saved.employer_name).toBeNull()
})

it('rejects missing owning claims and cross-claim updates/deletes and rolls back', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockResolvedValue([])
  await expect(saveActivity(execute, claimId, other)).rejects.toThrow(/claim no longer exists/)
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
  execute.mockImplementation(async (sql) => sql.startsWith('SELECT id FROM claims') ? [{ id: claimId }] : [])
  await expect(saveActivity(execute, claimId, other, recordId)).rejects.toThrow(/activity no longer exists in this claim/)
  await expect(deleteActivity(execute, claimId, recordId)).rejects.toThrow(/activity no longer exists in this claim/)
  expect(execute).toHaveBeenCalledWith('DELETE FROM activities WHERE id = ? AND claim_id = ? RETURNING id', [recordId, claimId])
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
})

it('rolls back SQL failures without converting them to success', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: claimId }]
    if (sql.startsWith('INSERT')) throw new Error('disk full')
    return []
  })
  await expect(saveActivity(execute, claimId, other)).rejects.toThrow('disk full')
  expect(execute).toHaveBeenLastCalledWith('ROLLBACK')
})

it('loads only the selected claim and leaves old read-only schemas unmodified', async () => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: claimId }]
    if (sql === 'PRAGMA user_version') return [{ user_version: 5 }]
    return [storedRow()]
  })
  await expect(listActivities(execute, claimId)).resolves.toHaveLength(1)
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('WHERE claim_id = ? ORDER BY activity_date DESC'), [claimId])
  execute.mockImplementation(async (sql) => sql === 'PRAGMA user_version' ? [{ user_version: 3 }] : [{ id: claimId }])
  await expect(listActivities(execute, claimId)).resolves.toEqual([])
  expect(execute).not.toHaveBeenCalledWith(expect.stringContaining('CREATE'))
})

it.each([
  { id: 'invalid' }, { activity_date: '2025-02-29' }, { created_at: '2026-02-30T00:00:00.000Z' },
  { updated_at: 'yesterday' }, { employer_name: 'Inapplicable' }, { claim_id: 'other-claim' },
  { activity_description: '  unnormalized  ' }, { documentation_description: 42 },
])('rejects corrupt or out-of-scope stored records: %j', async (override) => {
  const execute = vi.fn<StorageSession['execute']>().mockImplementation(async (sql) => {
    if (sql.startsWith('SELECT id FROM claims')) return [{ id: claimId }]
    if (sql === 'PRAGMA user_version') return [{ user_version: 5 }]
    return [{ ...storedRow(), ...override } as unknown as SqlRow]
  })
  await expect(listActivities(execute, claimId)).rejects.toThrow()
})
