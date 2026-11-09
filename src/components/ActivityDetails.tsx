import type { ReactNode } from 'react'
import { Badge, Box, Button, Divider, Fieldset, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { activityKinds, activityWarnings, contactMethods, contactTypes } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'
import { employerFields, worksourceFields } from './activity-fields'
import RecordTechnicalDetails from './RecordTechnicalDetails'

export default function ActivityDetails({ activity, readOnly, onEdit, onDelete }: {
  activity: Activity
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Paper component="section" aria-labelledby="activity-details-heading" withBorder p="md" radius="md" style={{ overflowWrap: 'anywhere' }}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title id="activity-details-heading" order={3}>Activity details</Title>
          <Badge variant="light">{activityKinds.find((kind) => kind.value === activity.kind)?.label}</Badge>
        </Group>
        <DetailField label="Activity date"><time dateTime={activity.activity_date}>{activity.activity_date}</time></DetailField>
        {activity.kind === 'employer_contact' ? (
          <>
            <Fieldset legend="Employer">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {employerFields.map(({ field, label }) => (
                  <DetailField key={field} label={label}>{activity[field]}</DetailField>
                ))}
              </SimpleGrid>
            </Fieldset>
            <Fieldset legend="Contact">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <DetailField label="Contact method">{contactMethods.find((item) => item.value === activity.contact_method)?.label}</DetailField>
                <DetailField label="Contact type">{contactTypes.find((item) => item.value === activity.contact_type)?.label}</DetailField>
                {activity.contact_method === 'other' && <DetailField label="Other contact method">{activity.contact_method_other}</DetailField>}
              </SimpleGrid>
            </Fieldset>
          </>
        ) : (
          <>
            <DetailField label="Activity description">{activity.activity_description}</DetailField>
            <DetailField label="Documentation description">{activity.documentation_description}</DetailField>
            {activity.kind === 'worksource_activity' && (
              <Fieldset legend="WorkSource location">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  {worksourceFields.map(({ field, label }) => <DetailField key={field} label={label}>{activity[field]}</DetailField>)}
                </SimpleGrid>
              </Fieldset>
            )}
          </>
        )}
        {activityWarnings(activity).map((warning) => <Text key={warning} size="sm" c="dimmed">{warning}</Text>)}
        <Divider label="Record information" labelPosition="left" />
        <Text size="sm"><strong>Created:</strong> <time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time></Text>
        <Text size="sm"><strong>Last edited:</strong> <time dateTime={activity.updated_at}>{new Date(activity.updated_at).toLocaleString()}</time></Text>
        <RecordTechnicalDetails key={activity.id} recordId={activity.id} />
        <Group>
          <Button variant="light" disabled={readOnly} onClick={onEdit}>Edit activity</Button>
          <Button variant="light" color="red" disabled={readOnly} onClick={onDelete}>Delete activity</Button>
        </Group>
      </Stack>
    </Paper>
  )
}

function DetailField({ label, children }: { label: string; children?: ReactNode }) {
  const missing = children === null || children === undefined || children === ''
  return (
    <Box component="dl" m={0} style={{ minWidth: 0 }}>
      <Text component="dt" size="sm" fw={500} mb={4}>{label}: </Text>
      <Paper component="dd" m={0} p="xs" withBorder radius="sm"
        style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minHeight: '2.25rem' }}>
        <Text component="span" size="sm" c={missing ? 'dimmed' : undefined}>{missing ? 'Not provided' : children}</Text>
      </Paper>
    </Box>
  )
}
