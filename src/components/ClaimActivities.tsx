import { useEffect, useState } from 'react'
import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { deleteProfileActivity, loadProfileActivities, saveProfileActivity } from '../storage/activities'
import { activityKinds, activityTitle } from '../storage/activity-model'
import type { Activity, ActivityInput } from '../storage/activity-model'
import ActivityDetails from './ActivityDetails'
import ActivityFormDialog from './ActivityFormDialog'
import DeleteActivityDialog from './DeleteActivityDialog'

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
  const selected = activities.find((item) => item.id === selectedId)
  const cannotWrite = readOnly || state.state !== 'loaded' || state.readOnly

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
    setEditing(undefined)
  }
  async function remove(activity: Activity) {
    await deleteProfileActivity(profileId, claimId, activity.id)
    setState((current) => current.state === 'loaded'
      ? { ...current, activities: current.activities.filter((item) => item.id !== activity.id) } : current)
    setDeleting(undefined)
    setSelectedId(undefined)
  }
  return (
    <Paper component="section" aria-labelledby="claim-activities-heading" withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title id="claim-activities-heading" order={2}>Job-search activities</Title>
          <Group>
            <Button variant="default" disabled={state.state === 'loading'} onClick={onReload}>Reload activities</Button>
            <Button disabled={cannotWrite} onClick={() => setEditing({})}>Add activity</Button>
          </Group>
        </Group>
        <Text size="sm" c="dimmed">Activities in this claim only, newest activity date first. This log does not determine ESD eligibility or file a claim.</Text>
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
            {activities.length === 0 ? <Text>No activities yet. {cannotWrite ? 'Write access is required to add one.' : 'Add an activity to start your log.'}</Text> : (
              <Stack component="ul" gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <Button fullWidth h="auto" py="sm" variant={activity.id === selectedId ? 'filled' : 'light'}
                      aria-pressed={activity.id === selectedId}
                      aria-label={`${activityTitle(activity)}, ${activity.activity_date}, record ${activity.id}`}
                      styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0, textAlign: 'left' } }}
                      onClick={() => setSelectedId(activity.id)}>
                      <Stack component="span" gap={4}>
                        <Text component="span" fw={600}>{activityTitle(activity)}</Text>
                        <Text component="span" size="sm">{activity.activity_date} - {activityKinds.find((item) => item.value === activity.kind)?.label}</Text>
                        <Text component="span" size="xs">Record ID: {activity.id}</Text>
                      </Stack>
                    </Button>
                  </li>
                ))}
              </Stack>
            )}
            {selected && <ActivityDetails activity={selected} readOnly={cannotWrite}
              onEdit={() => setEditing({ activity: selected })} onDelete={() => setDeleting(selected)} />}
          </>
        )}
        {editing && <ActivityFormDialog activity={editing.activity} readOnly={cannotWrite} onSave={save} onClose={() => setEditing(undefined)} />}
        {deleting && <DeleteActivityDialog activity={deleting} onConfirm={() => remove(deleting)} onClose={() => setDeleting(undefined)} />}
      </Stack>
    </Paper>
  )
}
