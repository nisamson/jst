import { activityKinds, activityTextFields, contactMethods, contactTypes } from './activity-model'
import type { Activity, ActivityKind } from './activity-model'

export type ActivitySearchResult = {
  activity: Activity
  matchedTokenCount: number
}

export function searchActivities(activities: Activity[], query: string, kind?: ActivityKind): ActivitySearchResult[] {
  const tokens = [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))]
  if (tokens.length === 0 && kind === undefined) return []

  const matches: ActivitySearchResult[] = []
  for (const activity of activities) {
    if (kind !== undefined && activity.kind !== kind) continue
    const fields = [
      activity.activity_date,
      activityKinds.find((item) => item.value === activity.kind)?.label,
      ...activityTextFields.map((field) => activity[field]),
      contactMethods.find((item) => item.value === activity.contact_method)?.label,
      contactTypes.find((item) => item.value === activity.contact_type)?.label,
    ].filter((field): field is string => Boolean(field)).map((field) => field.toLowerCase())
    const matchedTokenCount = tokens.filter((token) => fields.some((field) => field.includes(token))).length
    if (tokens.length > 0 && matchedTokenCount === 0) continue
    matches.push({ activity, matchedTokenCount })
  }

  return matches.toSorted((left, right) => right.matchedTokenCount - left.matchedTokenCount
    || right.activity.activity_date.localeCompare(left.activity.activity_date)
    || right.activity.created_at.localeCompare(left.activity.created_at)
    || left.activity.id.localeCompare(right.activity.id))
}
