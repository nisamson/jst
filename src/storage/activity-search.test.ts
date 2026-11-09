import { expect, it } from 'vitest'
import { normalizeActivity } from './activity-model'
import type { Activity, ActivityInput } from './activity-model'
import { searchActivities } from './activity-search'

function activity(id: string, input: ActivityInput): Activity {
  return {
    ...normalizeActivity(input),
    id,
    claim_id: 'claim',
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
  }
}

const employer = activity('employer', {
  activity_date: '2026-01-03',
  kind: 'employer_contact',
  job_title_or_reference: 'Senior Engineer',
  employer_name: 'Acme',
  contact_method: 'email',
  contact_type: 'interview',
  employer_phone: '555-0100',
})
const practice = activity('practice', {
  activity_date: '2026-01-10',
  kind: 'other_activity',
  activity_description: 'Engineer interview practice',
})

it('matches distinct case-insensitive substring tokens across user-entered fields and ranks by token count', () => {
  const results = searchActivities([practice, employer], ' ACME   engineer acme ')

  expect(results.map(({ activity: item, matchedTokenCount }) => [item.id, matchedTokenCount])).toEqual([
    ['employer', 2],
    ['practice', 1],
  ])
})

it('searches dates, contact details, and displayed kind labels, and filters by activity kind', () => {
  expect(searchActivities([employer, practice], '555-0100')[0]?.activity.id).toBe('employer')
  expect(searchActivities([employer, practice], '2026-01-03')[0]?.activity.id).toBe('employer')
  expect(searchActivities([employer, practice], 'employer contact')[0]?.activity.id).toBe('employer')
  expect(searchActivities([employer, practice], '', 'other_activity').map(({ activity: item }) => item.id)).toEqual(['practice'])
})

it('uses newest activity date as a tie-breaker and returns no matches for a blank or unmatched query', () => {
  const results = searchActivities([employer, practice], 'engineer')

  expect(results.map(({ activity: item }) => item.id)).toEqual(['practice', 'employer'])
  expect(searchActivities([employer, practice], '   ')).toEqual([])
  expect(searchActivities([employer, practice], 'no-match')).toEqual([])
})
