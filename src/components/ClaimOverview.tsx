import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'
import RecordTechnicalDetails from './RecordTechnicalDetails'
import MobileSectionDisclosure from './MobileSectionDisclosure'

export default function ClaimOverview({
  claim,
  canDelete = true,
  onDelete,
  onEdit,
}: {
  claim: Claim
  canDelete?: boolean
  onDelete?: () => void
  onEdit?: () => void
}) {
  return (
    <Paper component="section" aria-labelledby="claim-overview-heading" withBorder p="lg" radius="md" style={{ overflowWrap: 'anywhere' }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title id="claim-overview-heading" order={2}>{claim.identifier} overview</Title>
          <Badge variant="light">Selected claim</Badge>
        </Group>
        <MobileSectionDisclosure key={claim.id} label="claim overview"
          summary={`Start date: ${claim.claimStartDate ?? 'Not provided'}`}>
          <Stack gap="md">
            <Text size="lg"><strong>Claim identifier:</strong> {claim.identifier}</Text>
            <Text>
              <strong>Record created:</strong>{' '}
              <time dateTime={claim.createdAt}>
                {new Date(claim.createdAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </Text>
            <Text>
              <strong>Claim start date:</strong>{' '}
              {claim.claimStartDate
                ? <time dateTime={claim.claimStartDate}>{claim.claimStartDate}</time>
                : 'Not provided'}
            </Text>
            <Stack gap="xs">
              <Text fw={700}>Overview</Text>
              <Text style={{ whiteSpace: 'pre-wrap' }} c={claim.overview ? undefined : 'dimmed'}>
                {claim.overview ?? 'No overview provided.'}
              </Text>
            </Stack>
            <RecordTechnicalDetails key={claim.id} recordId={claim.id} />
          </Stack>
        </MobileSectionDisclosure>
        {onDelete && (
          <Group mt="sm">
            {onEdit && <Button variant="light" disabled={!canDelete} onClick={onEdit}>Edit claim</Button>}
            <Button
              color="red"
              variant="light"
              disabled={!canDelete}
              title={canDelete ? undefined : 'This profile is read-only.'}
              onClick={onDelete}
            >
              Delete claim
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  )
}
