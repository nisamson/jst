import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { activityKinds, activityTitle, activityWarnings, contactMethods, contactTypes } from '../storage/activity-model'
import type { Activity } from '../storage/activity-model'
import { employerFields, worksourceFields } from './activity-fields'

export default function ActivityDetails({ activity, readOnly, onEdit, onDelete }: {
  activity: Activity
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const fields = activity.kind === 'employer_contact' ? employerFields : activity.kind === 'worksource_activity' ? worksourceFields : []
  return (
    <Paper component="section" aria-labelledby="activity-details-heading" withBorder p="md" radius="md" style={{ overflowWrap: 'anywhere' }}>
      <Stack gap="sm">
        <Title id="activity-details-heading" order={3}>Activity details</Title>
        <Text fw={600} style={{ whiteSpace: 'pre-wrap' }}>{activityTitle(activity)}</Text>
        <Text>{activityKinds.find((kind) => kind.value === activity.kind)?.label}</Text>
        <Text><strong>Activity date:</strong> <time dateTime={activity.activity_date}>{activity.activity_date}</time></Text>
        {fields.map(({ field, label }) => <Text key={field} style={{ whiteSpace: 'pre-wrap' }}><strong>{label}:</strong> {activity[field] ?? 'Not provided'}</Text>)}
        {activity.kind === 'employer_contact' ? (
          <>
            <Text><strong>Contact method:</strong> {contactMethods.find((item) => item.value === activity.contact_method)?.label}</Text>
            {activity.contact_method === 'other' && <Text style={{ whiteSpace: 'pre-wrap' }}><strong>Other contact method:</strong> {activity.contact_method_other}</Text>}
            <Text><strong>Contact type:</strong> {contactTypes.find((item) => item.value === activity.contact_type)?.label}</Text>
          </>
        ) : (
          <>
            <Text style={{ whiteSpace: 'pre-wrap' }}><strong>Activity description:</strong> {activity.activity_description}</Text>
            <Text style={{ whiteSpace: 'pre-wrap' }}><strong>Documentation description:</strong> {activity.documentation_description ?? 'Not provided'}</Text>
          </>
        )}
        {activityWarnings(activity).map((warning) => <Text key={warning} size="sm" c="dimmed">{warning}</Text>)}
        <Text size="sm"><strong>Record ID:</strong> {activity.id}</Text>
        <Text size="sm"><strong>Created:</strong> <time dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString()}</time></Text>
        <Text size="sm"><strong>Last edited:</strong> <time dateTime={activity.updated_at}>{new Date(activity.updated_at).toLocaleString()}</time></Text>
        <Group>
          <Button variant="light" disabled={readOnly} onClick={onEdit}>Edit activity</Button>
          <Button variant="light" color="red" disabled={readOnly} onClick={onDelete}>Delete activity</Button>
        </Group>
      </Stack>
    </Paper>
  )
}
