import { Button, Stack, Text, Title } from '@mantine/core'
import type { Claim } from '../storage/claims'

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
    <Stack component="nav" aria-label="Claims" gap="xs">
      <Title order={2}>Claims</Title>
      {claims.length === 0 ? (
        <Text c="dimmed">No claims yet.</Text>
      ) : (
        claims.map((claim) => (
          <Button
            key={claim.id}
            variant={claim.id === selectedClaimId ? 'filled' : 'light'}
            aria-pressed={claim.id === selectedClaimId}
            onClick={() => onSelect(claim)}
          >
            {claim.identifier}
          </Button>
        ))
      )}
    </Stack>
  )
}
