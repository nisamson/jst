import { useState } from 'react'
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { weekDisplayLabel, weekRangeLabel } from '../storage/activity-weeks'
import type { ActivityWeeks } from '../storage/activity-weeks'

const weeksPerPage = 12

export default function ActivityWeekNavigator({ weeks, selectedWeek, onSelect }: {
  weeks: ActivityWeeks
  selectedWeek: number
  onSelect: (week: number) => void
}) {
  const [browsing, setBrowsing] = useState<{ selectedWeek: number; newest: number; page: number }>()
  const { groups, newest, totalWeeks } = weeks
  const totalPages = Math.ceil(totalWeeks / weeksPerPage)
  const selectedIndex = newest === undefined ? 0 : Math.max(0, Math.min(totalWeeks - 1, (newest - selectedWeek) / 7))
  const selectedPage = Math.floor(selectedIndex / weeksPerPage)
  const page = browsing?.selectedWeek === selectedWeek && browsing.newest === newest
    ? Math.min(browsing.page, totalPages - 1) : selectedPage
  const firstIndex = page * weeksPerPage
  const visibleWeeks = newest === undefined ? []
    : Array.from({ length: Math.min(weeksPerPage, totalWeeks - firstIndex) }, (_, index) => newest - (firstIndex + index) * 7)
  function browse(nextPage: number) {
    if (newest !== undefined) setBrowsing({ selectedWeek, newest, page: nextPage })
  }
  return (
    <Paper component="nav" aria-label="Activity weeks" withBorder p="sm" radius="md">
      <Stack gap="sm">
        <Title order={3}>Week overview</Title>
        {newest === undefined ? <Text size="sm">No recorded activity weeks yet.</Text> : (
          <>
            <Text size="sm">{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'}, {totalWeeks - groups.size} empty</Text>
            {totalPages > 1 && <Text size="xs">Showing weeks {firstIndex + 1}-{Math.min(firstIndex + weeksPerPage, totalWeeks)} of {totalWeeks}, newest first</Text>}
            <Stack gap="xs">
              {visibleWeeks.map((week) => {
                const count = groups.get(week)?.length ?? 0
                const label = weekRangeLabel(week)
                return (
                  <Button key={week} fullWidth h="auto" py="sm" justify="flex-start" variant={week === selectedWeek ? 'filled' : 'light'}
                    aria-label={`Week ${label}, ${count ? `${count} ${count === 1 ? 'activity' : 'activities'}` : 'No activities recorded'}`}
                    aria-pressed={week === selectedWeek} onClick={() => onSelect(week)}
                    styles={{ label: { whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' } }}>
                    <Stack component="span" gap={4}>
                      <Text component="span" size="sm">{weekDisplayLabel(week)}</Text>
                      <Text component="span" size="xs" c={count || week === selectedWeek ? undefined : 'dimmed'}>{count ? `${count} ${count === 1 ? 'activity' : 'activities'}` : 'No activities'}</Text>
                    </Stack>
                  </Button>
                )
              })}
            </Stack>
            {totalPages > 1 && (
              <Group gap="xs">
                <Button size="xs" variant="default" disabled={page === 0} onClick={() => browse(page - 1)}>Newer weeks</Button>
                <Button size="xs" variant="default" disabled={page >= totalPages - 1} onClick={() => browse(page + 1)}>Older weeks</Button>
                {page !== selectedPage && <Button size="xs" variant="subtle" onClick={() => setBrowsing(undefined)}>Show selected week</Button>}
              </Group>
            )}
          </>
        )}
      </Stack>
    </Paper>
  )
}
