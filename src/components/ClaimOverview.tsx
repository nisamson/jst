import { Paper, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'

export default function ClaimOverview({ claim }: { claim?: Claim }) {
  if (!claim) {
    return (
      <Paper component="section" aria-labelledby="empty-claims-heading" withBorder p="lg" radius="md">
        <Stack gap="xs">
          <Title id="empty-claims-heading" order={2}>No claims yet</Title>
          <Text c="dimmed">Claims for this profile will appear here when available.</Text>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper component="section" aria-labelledby="claim-overview-heading" withBorder p="lg" radius="md">
      <Stack gap="sm">
        <Title id="claim-overview-heading" order={2}>Claim overview</Title>
        <Text><strong>Claim identifier:</strong> {claim.identifier}</Text>
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
      </Stack>
    </Paper>
  )
}
