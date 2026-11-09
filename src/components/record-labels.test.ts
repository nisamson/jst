import { expect, it } from 'vitest'
import { normalizeActivity } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'
import { activitySelectionLabel, claimSelectionLabel } from './record-labels'

it('distinguishes matching claim names without exposing IDs and keeps numbering independent of display order', () => {
  const first = { id: 'a', identifier: 'Same name', createdAt: '2026-01-01T00:00:00.000Z' }
  const second = { ...first, id: 'b' }
  expect(claimSelectionLabel(first, [first])).toBe('Same name')
  expect(claimSelectionLabel(second, [second, first])).toBe('Same name, Entry 2')
  expect(claimSelectionLabel(first, [second, first])).toBe('Same name, Entry 1')
})

it('uses date/kind context and adds entry numbers only to activities with matching visible details', () => {
  const first: Activity = {
    ...normalizeActivity({ kind: 'other_activity', activity_date: '2026-01-01', activity_description: 'Practice' }),
    id: 'private-a', claim_id: 'private-claim', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
  const second = { ...first, id: 'private-b' }
  const differentDate = { ...first, id: 'private-c', activity_date: '2026-01-02' }
  expect(activitySelectionLabel(first, [differentDate, first])).toBe('Practice, 2026-01-01, Other activity')
  expect(activitySelectionLabel(second, [second, differentDate, first])).toBe('Practice, 2026-01-01, Other activity, Entry 2')
  expect(activitySelectionLabel(first, [second, first])).not.toContain('private')
})
