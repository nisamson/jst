import { Button, Stack, Text } from '@mantine/core'
import { activityKinds, activityTitle } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'
import { activitySelectionLabel } from './record-labels'

export default function ActivityList({ activities, selectedId, onSelect, label = 'Activities in selected week' }: {
  activities: Activity[]
  selectedId?: string
  onSelect: (id: string) => void
  label?: string
}) {
  return (
    <Stack component="ul" aria-label={label} gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
      {activities.map((activity) => (
        <li key={activity.id}>
          <Button fullWidth h="auto" py="sm" justify="flex-start" variant={activity.id === selectedId ? 'filled' : 'light'}
            aria-pressed={activity.id === selectedId}
            aria-label={activitySelectionLabel(activity, activities)}
            data-record-id={activity.id}
            styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0, textAlign: 'left' } }}
            onClick={() => onSelect(activity.id)}>
            <Stack component="span" gap={4}>
              <Text component="span" fw={600}>{activityTitle(activity)}{activitySelectionLabel(activity, activities).match(/, Entry \d+$/)?.[0]}</Text>
              <Text component="span" size="sm">{activity.activity_date} - {activityKinds.find((item) => item.value === activity.kind)?.label}</Text>
            </Stack>
          </Button>
        </li>
      ))}
    </Stack>
  )
}
