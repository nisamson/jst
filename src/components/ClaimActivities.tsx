import { useEffect, useState } from 'react'
import { Alert, Badge, Box, Button, Grid, Group, Loader, Paper, Select, Stack, Text, TextInput, Title, VisuallyHidden } from '@mantine/core'
import { deleteProfileActivity, loadProfileActivities, saveProfileActivity } from '../storage/activities'
import { activityKinds, localCalendarDate } from '../storage/activity-model'
import type { Activity, ActivityInput, ActivityKind } from '../storage/activity-model'
import { searchActivities } from '../storage/activity-search'
import type { ActivitySearchResult } from '../storage/activity-search'
import { activityWeekStart, groupActivitiesByWeek, weekDisplayLabel, weekInputDate, weekRangeLabel } from '../storage/activity-weeks'
import ActivityList from './ActivityList'
import ActivityDetails from './ActivityDetails'
import ActivityFormDialog from './ActivityFormDialog'
import ActivityWeekControls from './ActivityWeekControls'
import ActivityWeekNavigator from './ActivityWeekNavigator'
import DeleteActivityDialog from './DeleteActivityDialog'
import { activitySelectionLabel } from './record-labels'
import type { EvidenceDraft } from '../storage/evidence-model'

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
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchKind, setSearchKind] = useState<'all' | ActivityKind>('all')
  const [searchSelectedId, setSearchSelectedId] = useState<string>()
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
  const searchResults = searchActivities(activities, searchQuery, searchKind === 'all' ? undefined : searchKind)
  const searchGroups = new Map<number, ActivitySearchResult[]>()
  for (const result of searchResults) {
    const resultWeek = activityWeekStart(result.activity.activity_date)
    const group = searchGroups.get(resultWeek)
    if (group) group.push(result)
    else searchGroups.set(resultWeek, [result])
  }
  const searchSelected = searchResults.find((result) => result.activity.id === searchSelectedId)?.activity
  const searchActive = searchQuery.trim().length > 0 || searchKind !== 'all'
  const cannotWrite = readOnly || state.state !== 'loaded' || state.readOnly

  function selectWeek(nextWeek: number) {
    setSelectedWeek(nextWeek)
    if (nextWeek !== week) setSelectedId(undefined)
  }

  async function save(input: ActivityInput, evidence: EvidenceDraft) {
    const saved = await saveProfileActivity(profileId, claimId, input, editing?.activity?.id, evidence)
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
    setSearchSelectedId(undefined)
    setSelectedWeek(week)
  }
  function clearSearch() {
    setSearchQuery('')
    setSearchKind('all')
    setSearchSelectedId(undefined)
  }
  return (
    <Paper component="section" aria-labelledby="claim-activities-heading" withBorder px={{ base: 'xs', sm: 'md' }} py="md" radius="md">
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
            {activities.length > 0 && (
              <Box component="details" data-search-disclosure open={searchExpanded}
                onToggle={(event) => setSearchExpanded(event.currentTarget.open)}>
                <Text component="summary" size="sm" fw={500} style={{ cursor: 'pointer' }}>
                  <Group component="span" gap="xs" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <span>Search within claim</span>
                  </Group>
                </Text>
                <Stack mt="sm" gap="md">
                  <Group align="flex-end">
                    <TextInput label="Search activities" value={searchQuery} onChange={(event) => {
                      setSearchQuery(event.currentTarget.value)
                      setSearchSelectedId(undefined)
                    }} />
                    <Select label="Activity kind" data={[
                      { value: 'all', label: 'All activity types' },
                      ...activityKinds,
                    ]} value={searchKind} onChange={(value) => {
                      setSearchKind(activityKinds.find((item) => item.value === value)?.value ?? 'all')
                      setSearchSelectedId(undefined)
                    }} />
                    <Button variant="default" disabled={!searchActive} onClick={clearSearch}>Clear search</Button>
                  </Group>
                  {searchActive && (
                    <Box component="section" aria-label="Activity search results">
                      {searchResults.length === 0 ? (
                        <Text component="output">No activities match this search.</Text>
                      ) : (
                        <Stack gap="md">
                          <Text component="output" aria-live="polite" aria-atomic="true">
                            {searchResults.length} matching {searchResults.length === 1 ? 'activity' : 'activities'}
                            {' '}in {searchGroups.size} {searchGroups.size === 1 ? 'week' : 'weeks'}.
                          </Text>
                          {[...searchGroups].map(([resultWeek, results]) => (
                            <Box component="section" key={resultWeek} aria-label={`Search results for week ${weekRangeLabel(resultWeek)}`}>
                              <Group justify="space-between">
                                <Title order={4}>{weekDisplayLabel(resultWeek)}</Title>
                                <Badge variant="light" color="gray">{results.length} {results.length === 1 ? 'activity' : 'activities'}</Badge>
                              </Group>
                              <ActivityList activities={results.map((result) => result.activity)} selectedId={searchSelectedId}
                                onSelect={setSearchSelectedId} label={`Search results for week ${weekRangeLabel(resultWeek)}`} />
                            </Box>
                          ))}
                          {searchSelected && <ActivityDetails activity={searchSelected} profileId={profileId} claimId={claimId} readOnly={cannotWrite}
                            onEdit={() => setEditing({ activity: searchSelected })} onDelete={() => setDeleting(searchSelected)} />}
                        </Stack>
                      )}
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
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
                  {selected && (!searchExpanded || !searchSelected) && <ActivityDetails activity={selected} profileId={profileId} claimId={claimId} readOnly={cannotWrite}
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
