import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'
import { claimSelectionLabel } from './record-labels'

export default function ClaimSidebar({
  claims,
  selectedClaimId,
  onSelect,
}: {
  claims: Claim[]
  selectedClaimId?: string
  onSelect: (claim: Claim) => void
}) {
  return (
    <Paper component="nav" aria-label="Claims" withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Claims</Title>
          <Badge variant="light" aria-label={`${claims.length} claims`}>{claims.length}</Badge>
        </Group>
        <Text c="dimmed" size="sm">Newest records first. Select a claim to review its details.</Text>
        <Stack component="ul" gap="xs" p={0} m={0} style={{ listStyle: 'none' }}>
          {claims.map((claim) => {
            const duplicate = claims.some((item) => item.id !== claim.id && item.identifier === claim.identifier)
            const descriptionId = `claim-description-${claim.id}`
            return (
              <li key={claim.id}>
                <Button
                  fullWidth
                  h="auto"
                  py="sm"
                  justify="flex-start"
                  variant={claim.id === selectedClaimId ? 'filled' : 'light'}
                  aria-label={claimSelectionLabel(claim, claims)}
                  data-record-id={claim.id}
                  aria-describedby={descriptionId}
                  aria-pressed={claim.id === selectedClaimId}
                  styles={{ label: { whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere', minWidth: 0 } }}
                  onClick={() => onSelect(claim)}
                >
                  <Stack component="span" gap={4}>
                    <Text component="span" fw={600}>{claimSelectionLabel(claim, claims)}</Text>
                    <Text component="span" id={descriptionId} size="xs">
                      Start date: {claim.claimStartDate ?? 'Not provided'}
                      {duplicate && <Text component="span" inherit display="block">Created: {new Date(claim.createdAt).toLocaleDateString()}</Text>}
                    </Text>
                  </Stack>
                </Button>
              </li>
            )
          })}
        </Stack>
      </Stack>
    </Paper>
  )
}
