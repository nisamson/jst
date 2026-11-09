import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { localCalendarDate } from '../storage/activity-model'
import { activityWeekStart, firstActivityWeek, lastActivityWeek, weekInputDate } from '../storage/activity-weeks'
import { isCalendarDate } from '../storage/calendar-date'

export default function ActivityWeekControls({ week, onSelect, children }: {
  week: number
  onSelect: (week: number) => void
  children?: ReactNode
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" gap="sm">
        {children}
        <Group gap="xs">
        <Button size="compact-sm" variant="default" disabled={week <= firstActivityWeek} onClick={() => onSelect(week - 7)}>Previous week</Button>
        <Button size="compact-sm" variant="default" disabled={week >= lastActivityWeek} onClick={() => onSelect(week + 7)}>Next week</Button>
        {week !== activityWeekStart(localCalendarDate()) && (
          <Button size="compact-sm" variant="subtle" onClick={() => onSelect(activityWeekStart(localCalendarDate()))}>Current week</Button>
        )}
        </Group>
      </Group>
      <Box component="details">
        <Text component="summary" size="sm" style={{ cursor: 'pointer' }}>Jump to week</Text>
        <Box mt="sm"><WeekJumpForm key={week} week={week} onSelect={onSelect} /></Box>
      </Box>
    </Stack>
  )
}

function WeekJumpForm({ week, onSelect }: { week: number; onSelect: (week: number) => void }) {
  const [date, setDate] = useState(weekInputDate(week))
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  return (
    <form noValidate onSubmit={(event) => {
      event.preventDefault()
      if (!input.current?.validity.valid || !isCalendarDate(date)) {
        setError('Choose a complete, real calendar date to select its week.')
        return
      }
      setError(undefined)
      onSelect(activityWeekStart(date))
    }}>
      <Group align="flex-end" gap="xs">
        <TextInput ref={input} label="Jump to week containing" type="date" required min="0001-01-01" max="9999-12-31"
          value={date} error={error} onChange={(event) => setDate(event.currentTarget.value)} />
        <Button variant="default" type="submit">Go to week</Button>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>Choose any date in the week. Empty weeks can also be opened.</Text>
    </form>
  )
}
