import { Badge, Box, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'
import { claimSelectionLabel } from './record-labels'
import MobileSectionDisclosure from './MobileSectionDisclosure'
import { useDisplaySettings } from './display-settings-context'

export default function ClaimSidebar({
  claims,
  selectedClaimId,
  onSelect,
}: {
  claims: Claim[]
  selectedClaimId?: string
  onSelect: (claim: Claim) => void
}) {
  const { advanced } = useDisplaySettings()
  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId)
  return (
    <Paper component="nav" aria-label="Claims" withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Claims</Title>
          <Badge variant="light" aria-label={`${claims.length} claims`}>{claims.length}</Badge>
        </Group>
        <MobileSectionDisclosure label="claims"
          summary={selectedClaim
            ? `Selected: ${claimSelectionLabel(selectedClaim, claims)}`
            : 'No claim selected. Choose a claim to continue.'}>
          <Stack gap="md">
            <Text c="dimmed" size="sm">Newest records first. Select a claim to review its details.</Text>
            <Box component="ul" className="claim-list">
              {claims.map((claim) => {
                const duplicate = claims.some((item) => item.id !== claim.id && item.identifier === claim.identifier)
                const descriptionId = `claim-description-${claim.id}`
                const label = claimSelectionLabel(claim, claims)
                return (
                  <li key={claim.id}>
                    <Button
                      fullWidth
                      h="auto"
                      py="sm"
                      justify="flex-start"
                      variant={claim.id === selectedClaimId ? 'filled' : 'light'}
                      aria-label={label}
                      title={label}
                      data-record-id={claim.id}
                      aria-describedby={descriptionId}
                      aria-pressed={claim.id === selectedClaimId}
                      styles={{ label: { whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere', minWidth: 0 } }}
                      onClick={() => onSelect(claim)}
                    >
                      <Stack component="span" gap={4} style={{ minWidth: 0, width: '100%' }}>
                        <Text component="span" fw={600} truncate="end">{label}</Text>
                        <Text component="span" id={descriptionId} size="xs">
                          Start date: {claim.claimStartDate ?? 'Not provided'}
                          {duplicate && advanced && <Text component="span" inherit display="block">Created: {new Date(claim.createdAt).toLocaleDateString()}</Text>}
                        </Text>
                      </Stack>
                    </Button>
                  </li>
                )
              })}
            </Box>
          </Stack>
        </MobileSectionDisclosure>
      </Stack>
    </Paper>
  )
}
