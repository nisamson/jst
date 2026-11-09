import { useState } from 'react'
import { Alert, Badge, Button, Grid, Group, Paper, Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import type { Claim, ClaimInput } from '../storage/claims'
import type { ProfileSession } from '../storage/profiles'
import ClaimOverview from './ClaimOverview'
import ClaimSidebar from './ClaimSidebar'
import ConfirmDeletionDialog from './ConfirmDeletionDialog'
import ClaimFormDialog from './ClaimFormDialog'
import ClaimActivities from './ClaimActivities'
import { claimSelectionLabel } from './record-labels'

export default function ClaimsWorkspace({
  profile,
  access,
  claims,
  claimId,
  onNavigate,
  onDelete,
  onSave,
}: {
  profile: ProfileSession['profile']
  access: ProfileSession['access']
  claims: Claim[]
  claimId?: string
  onNavigate: (path: string) => void
  onDelete: (claim: Claim) => Promise<void>
  onSave: (input: ClaimInput, claimId?: string) => Promise<Claim>
}) {
  const [claimToDelete, setClaimToDelete] = useState<Claim>()
  const [editing, setEditing] = useState<{ claim?: Claim }>()
  const selectedClaimId = claimId ?? claims[0]?.id
  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId)
  const overviewPath = `/claims?profile=${encodeURIComponent(profile.id)}`
  const readOnly = access.mode === 'read-only'

  async function removeClaim(claim: Claim) {
    await onDelete(claim)
    setClaimToDelete(undefined)
    onNavigate(overviewPath)
  }

  async function saveClaim(input: ClaimInput) {
    const saved = await onSave(input, editing?.claim?.id)
    setEditing(undefined)
    onNavigate(`${overviewPath}&claim=${encodeURIComponent(saved.id)}`)
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs">
          <Text component="output" style={{ overflowWrap: 'anywhere' }}>
            Profile: <strong>{profile.label}</strong>
          </Text>
          <Badge color={readOnly ? 'yellow' : 'teal'} variant="light">
            {readOnly ? 'Read-only' : 'View and edit'}
          </Badge>
        </Stack>
        <Group>
          <Button disabled={readOnly} onClick={() => setEditing({})}>Create claim</Button>
          <Button variant="default" onClick={() => onNavigate('/')}>Switch profile</Button>
        </Group>
      </Group>
      {readOnly && (
        <Alert color="yellow" role="note" title="Profile is read-only">
          {access.persistence === 'denied'
            ? 'Persistent storage was not granted.'
            : access.persistence === 'unavailable'
              ? 'This browser cannot verify persistent storage.'
              : access.persistence === 'unknown'
                ? 'The persistent-storage status is unknown.'
                : 'Checking persistent storage failed.'}{' '}
          Simulated sync is not connected. You can view this profile, but profile-content changes are blocked.
          The local data is not protected or backed up.
        </Alert>
      )}
      <VisuallyHidden aria-live="polite" aria-atomic="true">
        {selectedClaim ? `Selected claim: ${claimSelectionLabel(selectedClaim, claims)}` : ''}
      </VisuallyHidden>
      <Grid gap="lg" align="flex-start">
        {claims.length > 0 && (
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <ClaimSidebar
              claims={claims}
              selectedClaimId={selectedClaimId}
              onSelect={(claim) => onNavigate(`${overviewPath}&claim=${encodeURIComponent(claim.id)}`)}
            />
          </Grid.Col>
        )}
        <Grid.Col span={{ base: 12, sm: claims.length > 0 ? 8 : 12 }}>
          {claimId !== undefined && !selectedClaim ? (
            <Alert color="yellow" title="The selected claim is unavailable">
              <Stack gap="sm">
                <Text>Choose an available claim from this profile. No other profile's claims are shown.</Text>
                <Button variant="light" onClick={() => onNavigate(overviewPath)}>
                  Return to claims overview
                </Button>
              </Stack>
            </Alert>
          ) : selectedClaim ? (
            <Stack>
              <ClaimOverview
                claim={selectedClaim}
                canDelete={!readOnly}
                onDelete={() => setClaimToDelete(selectedClaim)}
                onEdit={() => setEditing({ claim: selectedClaim })}
              />
              <ClaimActivities key={`${profile.id}-${selectedClaim.id}`} profileId={profile.id}
                claimId={selectedClaim.id} readOnly={readOnly} />
            </Stack>
          ) : (
            <Paper component="section" aria-labelledby="empty-claims-heading" withBorder p="lg" radius="md">
              <Stack gap="xs">
                <Title id="empty-claims-heading" order={2}>No claims yet</Title>
                <Text c="dimmed">This profile has no claim records.</Text>
                <Text size="sm">{readOnly
                  ? 'You can view this profile, but creating a claim requires write access.'
                  : 'Use Create claim to add your first record, with an identifier and optional start date.'}</Text>
              </Stack>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
      {editing && (
        <ClaimFormDialog
          claim={editing.claim}
          readOnly={readOnly}
          onClose={() => setEditing(undefined)}
          onSave={saveClaim}
        />
      )}
      {claimToDelete && (
        <ConfirmDeletionDialog
          itemType="claim"
          name={claimToDelete.identifier}
          description={`${claimSelectionLabel(claimToDelete, claims)}. Start date: ${claimToDelete.claimStartDate ?? 'Not provided'}. Created: ${new Date(claimToDelete.createdAt).toLocaleString()}`}
          recordId={claimToDelete.id}
          onClose={() => setClaimToDelete(undefined)}
          onConfirm={() => removeClaim(claimToDelete)}
        />
      )}
    </Stack>
  )
}
