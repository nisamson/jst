import { isCalendarDate } from './calendar-date'
import type { Activity } from './activity-model'

const millisecondsPerDay = 86_400_000

function calendarDay(value: string) {
  if (!isCalendarDate(value)) throw new Error('Choose a real calendar date between 0001-01-01 and 9999-12-31.')
  const [year, month, day] = value.split('-').map(Number)
  // UTC is only a Gregorian arithmetic tool here; never convert entered dates to local instants.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime() / millisecondsPerDay
}

export function activityWeekStart(value: string) {
  const day = calendarDay(value)
  return day - ((day + 4) % 7 + 7) % 7
}

export const firstActivityWeek = activityWeekStart('0001-01-01')
export const lastActivityWeek = activityWeekStart('9999-12-31')

export function weekCalendarDate(day: number) {
  const date = new Date(day * millisecondsPerDay)
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function weekRangeLabel(week: number) {
  return `${weekCalendarDate(week)} to ${weekCalendarDate(week + 6)}`
}

export function weekDisplayLabel(week: number) {
  const firstYear = new Date(week * millisecondsPerDay).getUTCFullYear()
  const lastYear = new Date((week + 6) * millisecondsPerDay).getUTCFullYear()
  if (firstYear < 1 || lastYear > 9999) return weekRangeLabel(week)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).formatRange(new Date(week * millisecondsPerDay), new Date((week + 6) * millisecondsPerDay))
}

export function weekInputDate(week: number) {
  return week < calendarDay('0001-01-01') ? '0001-01-01' : weekCalendarDate(week)
}

export function groupActivitiesByWeek(activities: Activity[]) {
  const groups = new Map<number, Activity[]>()
  let newest: number | undefined
  let oldest: number | undefined
  const ordered = activities.toSorted((left, right) => right.activity_date.localeCompare(left.activity_date)
    || right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id))
  for (const activity of ordered) {
    const week = activityWeekStart(activity.activity_date)
    const group = groups.get(week)
    if (group) group.push(activity)
    else groups.set(week, [activity])
    newest = newest === undefined ? week : Math.max(newest, week)
    oldest = oldest === undefined ? week : Math.min(oldest, week)
  }
  const totalWeeks = newest === undefined || oldest === undefined ? 0 : (newest - oldest) / 7 + 1
  return { groups, newest, oldest, totalWeeks }
}

export type ActivityWeeks = ReturnType<typeof groupActivitiesByWeek>
