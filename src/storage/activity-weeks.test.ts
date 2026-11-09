import { expect, it } from 'vitest'
import { normalizeActivity } from './activity-model'
import type { Activity } from './activity-model'
import {
  activityWeekStart, firstActivityWeek, groupActivitiesByWeek, lastActivityWeek,
  weekCalendarDate, weekInputDate, weekRangeLabel,
} from './activity-weeks'

function activity(id: string, date: string, createdAt = '2026-01-01T00:00:00.000Z'): Activity {
  return {
    ...normalizeActivity({ kind: 'other_activity', activity_date: date, activity_description: 'Same description' }),
    id, claim_id: 'claim', created_at: createdAt, updated_at: createdAt,
  }
}

it.each([
  ['2026-01-04', '2026-01-04 to 2026-01-10'],
  ['2026-01-10', '2026-01-04 to 2026-01-10'],
  ['2026-01-11', '2026-01-11 to 2026-01-17'],
  ['2026-01-01', '2025-12-28 to 2026-01-03'],
  ['2025-12-31', '2025-12-28 to 2026-01-03'],
  ['2024-02-29', '2024-02-25 to 2024-03-02'],
  ['1900-03-01', '1900-02-25 to 1900-03-03'],
  ['2000-02-29', '2000-02-27 to 2000-03-04'],
  ['2026-03-08', '2026-03-08 to 2026-03-14'],
  ['2026-11-01', '2026-11-01 to 2026-11-07'],
  ['0099-01-01', '0098-12-28 to 0099-01-03'],
  ['0001-01-01', '0000-12-31 to 0001-01-06'],
  ['9999-12-31', '9999-12-26 to 10000-01-01'],
])('derives the Sunday through Saturday for %s without changing its calendar date', (date, label) => {
  expect(weekRangeLabel(activityWeekStart(date))).toBe(label)
})

it.each(['2026-02-29', '1900-02-29', '0000-12-31', '10000-01-01', '2026-1-01', '2026-01-01T00:00:00Z', ''])(
  'rejects invalid activity dates before grouping: %s', (date) => {
    expect(() => activityWeekStart(date)).toThrow(/real calendar date/)
  },
)

it('keeps the first and last supported activity weeks navigable with valid date inputs', () => {
  expect(weekInputDate(firstActivityWeek)).toBe('0001-01-01')
  expect(weekInputDate(lastActivityWeek)).toBe('9999-12-26')
  expect(activityWeekStart('0001-01-06')).toBe(firstActivityWeek)
  expect(activityWeekStart('9999-12-31')).toBe(lastActivityWeek)
  expect(weekCalendarDate(firstActivityWeek + 7)).toBe('0001-01-07')
})

it('groups on activity date alone, retains duplicates, orders within weeks, and derives gaps without filling an array', () => {
  const input = [
    activity('same-day-a', '2026-01-01'),
    activity('next-week', '2026-01-04', '1900-01-01T00:00:00.000Z'),
    activity('saturday', '2026-01-03'),
    activity('same-day-b', '2026-01-01'),
    activity('older-week', '2025-12-14', '2099-01-01T00:00:00.000Z'),
    activity('same-day-newer', '2026-01-01', '2026-01-02T00:00:00.000Z'),
  ]
  const result = groupActivitiesByWeek(input)
  expect(result.totalWeeks).toBe(4)
  expect(result.newest).toBe(activityWeekStart('2026-01-04'))
  expect(result.oldest).toBe(activityWeekStart('2025-12-14'))
  expect(result.groups.size).toBe(3)
  expect(result.groups.has(activityWeekStart('2025-12-21'))).toBe(false)
  expect(result.groups.get(activityWeekStart('2026-01-01'))?.map((item) => item.id))
    .toEqual(['saturday', 'same-day-newer', 'same-day-a', 'same-day-b'])
  expect(input[0]?.id).toBe('same-day-a')
})

it('moves edited dates into a new group and drops unused endpoints from the derived range', () => {
  const original = activity('edited', '2025-12-14')
  const retained = activity('retained', '2026-01-04')
  const result = groupActivitiesByWeek([{ ...original, activity_date: '2026-01-10' }, retained])
  expect(result.totalWeeks).toBe(1)
  expect(result.groups.get(activityWeekStart('2026-01-04'))).toHaveLength(2)
})

it('handles empty claims and very long histories without a weekly cap or allocating empty weeks', () => {
  expect(groupActivitiesByWeek([])).toEqual({ groups: new Map(), oldest: undefined, newest: undefined, totalWeeks: 0 })
  const result = groupActivitiesByWeek([
    ...Array.from({ length: 10 }, (_, index) => activity(`duplicate-${index}`, '0001-01-01')),
    activity('latest', '9999-12-31'),
  ])
  expect(result.groups.size).toBe(2)
  expect(result.totalWeeks).toBeGreaterThan(500_000)
  expect(result.groups.get(firstActivityWeek)).toHaveLength(10)
})
