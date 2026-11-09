import type { Claim } from '../storage/claims'
import { activityKinds, activityTitle } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'

function entrySuffix(id: string, matches: { id: string }[]) {
  if (matches.length < 2) return ''
  const index = matches.toSorted((left, right) => left.id.localeCompare(right.id)).findIndex((item) => item.id === id)
  return `, Entry ${index + 1}`
}

export function claimSelectionLabel(claim: Claim, claims: Claim[]) {
  return claim.identifier + entrySuffix(claim.id, claims.filter((item) => item.identifier === claim.identifier))
}

export function activitySelectionLabel(activity: Activity, activities: Activity[]) {
  const kind = activityKinds.find((item) => item.value === activity.kind)?.label
  const matches = activities.filter((item) => activityTitle(item) === activityTitle(activity)
    && item.activity_date === activity.activity_date && item.kind === activity.kind)
  return `${activityTitle(activity)}, ${activity.activity_date}, ${kind}${entrySuffix(activity.id, matches)}`
}
