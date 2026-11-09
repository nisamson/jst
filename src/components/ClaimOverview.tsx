import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'

export default function ClaimOverview({
  claim,
  canDelete = true,
  onDelete,
}: {
  claim: Claim
  canDelete?: boolean
  onDelete?: () => void
}) {
  return (
    <Paper component="section" aria-labelledby="claim-overview-heading" withBorder p="lg" radius="md" style={{ overflowWrap: 'anywhere' }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title id="claim-overview-heading" order={2}>Claim overview</Title>
          <Badge variant="light">Selected claim</Badge>
        </Group>
        <Text size="lg"><strong>Claim identifier:</strong> {claim.identifier}</Text>
        <Text size="sm" c="dimmed"><strong>Record ID:</strong> {claim.id}</Text>
        <Text>
          <strong>Record created:</strong>{' '}
          <time dateTime={claim.createdAt}>{claim.createdAt}</time>
        </Text>
        <Text>
          <strong>Claim start date:</strong>{' '}
          {claim.claimStartDate
            ? <time dateTime={claim.claimStartDate}>{claim.claimStartDate}</time>
            : 'Not provided'}
        </Text>
        {onDelete && (
          <Group mt="sm">
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
