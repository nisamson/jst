import { useEffect, useState } from 'react'
import { Alert, Badge, Box, Button, Grid, Group, Loader, Paper, Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { deleteProfileActivity, loadProfileActivities, saveProfileActivity } from '../storage/activities'
import { localCalendarDate } from '../storage/activity-model'
import type { Activity, ActivityInput } from '../storage/activity-model'
import { activityWeekStart, groupActivitiesByWeek, weekDisplayLabel, weekInputDate, weekRangeLabel } from '../storage/activity-weeks'
import ActivityList from './ActivityList'
import ActivityDetails from './ActivityDetails'
import ActivityFormDialog from './ActivityFormDialog'
import ActivityWeekControls from './ActivityWeekControls'
import ActivityWeekNavigator from './ActivityWeekNavigator'
import DeleteActivityDialog from './DeleteActivityDialog'
import { activitySelectionLabel } from './record-labels'

type State = { state: 'loading' } | { state: 'error'; message: string }
  | { state: 'loaded'; activities: Activity[]; readOnly: boolean }

type Props = {
  profileId: string
  claimId: string
  readOnly: boolean
}

export default function ClaimActivities(props: Props) {
  const [attempt, setAttempt] = useState(0)
  return <ActivitiesContent key={`${props.profileId}-${props.claimId}-${attempt}`} {...props}
    onReload={() => setAttempt((value) => value + 1)} />
}

function ActivitiesContent({ profileId, claimId, readOnly, onReload }: Props & { onReload: () => void }) {
  const [state, setState] = useState<State>({ state: 'loading' })
  const [selectedWeek, setSelectedWeek] = useState<number>()
  const [selectedId, setSelectedId] = useState<string>()
  const [editing, setEditing] = useState<{ activity?: Activity }>()
  const [deleting, setDeleting] = useState<Activity>()
  useEffect(() => {
    let cancelled = false
    loadProfileActivities(profileId, claimId).then((result) => {
      if (!cancelled) setState({ state: 'loaded', ...result })
    }).catch((failure: unknown) => {
      if (!cancelled) setState({ state: 'error', message: failure instanceof Error ? failure.message : 'Activities could not be loaded.' })
    })
    return () => { cancelled = true }
  }, [profileId, claimId])
  const activities = state.state === 'loaded' ? state.activities : []
  const weeks = groupActivitiesByWeek(activities)
  const week = selectedWeek ?? weeks.newest ?? activityWeekStart(localCalendarDate())
  const weekActivities = weeks.groups.get(week) ?? []
  const selected = weekActivities.find((item) => item.id === selectedId)
  const cannotWrite = readOnly || state.state !== 'loaded' || state.readOnly

  function selectWeek(nextWeek: number) {
    setSelectedWeek(nextWeek)
    if (nextWeek !== week) setSelectedId(undefined)
  }

  async function save(input: ActivityInput) {
    const saved = await saveProfileActivity(profileId, claimId, input, editing?.activity?.id)
    setState((current) => current.state === 'loaded'
      ? {
        ...current,
        activities: [...current.activities.filter((item) => item.id !== saved.id), saved]
          .toSorted((left, right) => right.activity_date.localeCompare(left.activity_date)
            || right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id)),
      } : current)
    setSelectedId(saved.id)
    setSelectedWeek(activityWeekStart(saved.activity_date))
    setEditing(undefined)
  }
  async function remove(activity: Activity) {
    await deleteProfileActivity(profileId, claimId, activity.id)
    setState((current) => current.state === 'loaded'
      ? { ...current, activities: current.activities.filter((item) => item.id !== activity.id) } : current)
    setDeleting(undefined)
    setSelectedId(undefined)
    setSelectedWeek(week)
  }
  return (
    <Paper component="section" aria-labelledby="claim-activities-heading" withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title id="claim-activities-heading" order={2}>Job-search activities</Title>
          <Group>
            <Button variant="subtle" size="compact-sm" disabled={state.state === 'loading'} onClick={onReload}>Reload activities</Button>
            <Button disabled={cannotWrite} onClick={() => setEditing({})}>Add activity</Button>
          </Group>
        </Group>
        <Box component="details">
          <Text component="summary" size="sm" c="dimmed" style={{ cursor: 'pointer' }}>Help</Text>
          <Text size="sm" c="dimmed" mt="xs">
            Activities belong to this claim and are grouped Sunday through Saturday by activity date.
            The week overview includes gaps between the earliest and latest recorded activity.
            These are activity records, not filing status. This log does not determine ESD eligibility or file a claim.
          </Text>
        </Box>
        {state.state === 'loading' && <Group><Loader size="sm" /><Text component="output">Loading activities...</Text></Group>}
        {state.state === 'error' && (
          <Alert title="Activities could not be loaded" color="red">
            <Stack><Text>{state.message}</Text><Text>No activities have been changed.</Text>
              <Button variant="light" onClick={onReload}>Retry loading activities</Button>
            </Stack>
          </Alert>
        )}
        {state.state === 'loaded' && (
          <>
            {cannotWrite && <Text size="sm">Activities are read-only for this profile.</Text>}
            {activities.length === 0 && <Text>No activities yet. {cannotWrite ? 'Write access is required to add one.' : 'Add an activity to start your log.'}</Text>}
            {activities.length > 0 && <Grid gap="md" align="flex-start">
              <Grid.Col span={{ base: 12, lg: 4 }}>
                <ActivityWeekNavigator weeks={weeks} selectedWeek={week} onSelect={selectWeek} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 8 }}>
                <Stack component="section" aria-label="Selected activity week" gap="md">
                  <ActivityWeekControls week={week} onSelect={selectWeek}>
                    <Group gap="xs">
                      <Title order={3} aria-label={`Week: ${weekRangeLabel(week)}`}>{weekDisplayLabel(week)}</Title>
                      <Badge variant="light" color="gray">{weekActivities.length} {weekActivities.length === 1 ? 'activity' : 'activities'}</Badge>
                    </Group>
                  </ActivityWeekControls>
                  <VisuallyHidden component="output" aria-live="polite" aria-atomic="true">
                    {weekRangeLabel(week)}: {weekActivities.length} {weekActivities.length === 1 ? 'activity' : 'activities'}
                  </VisuallyHidden>
                  {weeks.newest !== undefined && weeks.oldest !== undefined && (week > weeks.newest || week < weeks.oldest)
                    && <Text size="sm">This week is outside the recorded activity range. The overview still shows your existing history.</Text>}
                  {weekActivities.length === 0 ? <Text>No activities recorded for this week.</Text> : (
                    <ActivityList activities={weekActivities} selectedId={selectedId} onSelect={setSelectedId} />
                  )}
                  {selected && <ActivityDetails activity={selected} readOnly={cannotWrite}
                    onEdit={() => setEditing({ activity: selected })} onDelete={() => setDeleting(selected)} />}
                </Stack>
              </Grid.Col>
            </Grid>}
          </>
        )}
        {editing && <ActivityFormDialog activity={editing.activity}
          initialDate={activities.length === 0 || activityWeekStart(localCalendarDate()) === week ? localCalendarDate() : weekInputDate(week)}
          readOnly={cannotWrite} onSave={save} onClose={() => setEditing(undefined)} />}
        {deleting && <DeleteActivityDialog activity={deleting} selectionLabel={activitySelectionLabel(deleting, activities)}
          onConfirm={() => remove(deleting)} onClose={() => setDeleting(undefined)} />}
      </Stack>
    </Paper>
  )
}
