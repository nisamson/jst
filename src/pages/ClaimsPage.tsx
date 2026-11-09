import { useEffect, useState } from 'react'
import { Alert, Anchor, Breadcrumbs, Button, Container, Grid, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { openProfile } from '../storage/profiles'
import type { Profile } from '../storage/profiles'
import type { Persistence } from '../storage/environment'
import { deleteProfileClaim, listClaims } from '../storage/claims'
import type { Claim } from '../storage/claims'
import ClaimOverview from '../components/ClaimOverview'
import ClaimSidebar from '../components/ClaimSidebar'
import ConfirmDeletionDialog from '../components/ConfirmDeletionDialog'

type ProfileState =
  | { state: 'loading' }
  | {
    state: 'loaded'
    profile: Profile
    claims: Claim[]
    access: { mode: 'read-write' | 'read-only'; persistence: Persistence; syncConnected: boolean }
  }
  | { state: 'error'; title: string; message: string }

export default function ClaimsPage({
  profileId,
  claimId,
  onNavigate,
}: {
  profileId?: string
  claimId?: string
  onNavigate: (path: string) => void
}) {
  const [attempt, setAttempt] = useState(0)

  if (!profileId) {
    return (
      <Container component="main" size="var(--app-content-width)" py="xl">
        <Stack gap="md">
          <Title order={1}>Choose a profile</Title>
          <Text>A local profile must be selected before its claims overview can be opened.</Text>
          <Group>
            <Button onClick={() => onNavigate('/')}>Return to profiles</Button>
          </Group>
        </Stack>
      </Container>
    )
  }

  return (
    <ClaimsOverview
      key={`${profileId}-${attempt}`}
      profileId={profileId}
      claimId={claimId}
      onRetry={() => setAttempt((value) => value + 1)}
      onNavigate={onNavigate}
    />
  )
}

function ClaimsOverview({
  profileId,
  claimId,
  onRetry,
  onNavigate,
}: {
  profileId: string
  claimId?: string
  onRetry: () => void
  onNavigate: (path: string) => void
}) {
  const [profileState, setProfileState] = useState<ProfileState>({ state: 'loading' })
  const [claimToDelete, setClaimToDelete] = useState<Claim>()

  useEffect(() => {
    let cancelled = false
    let dispose: (() => Promise<void>) | undefined

    openProfile(profileId).then(async (session) => {
      dispose = session.dispose
      if (cancelled) {
        await session.dispose().catch((error: unknown) => {
          console.error('Could not close the profile storage session.', error)
        })
        return
      }

      let claims: Claim[]
      try {
        claims = await listClaims(session.execute)
      } catch (error) {
        await session.dispose().catch((disposeError: unknown) => {
          console.error('Could not close the profile storage session after reading claims.', disposeError)
        })
        dispose = undefined
        if (!cancelled) {
          setProfileState({
            state: 'error',
            title: 'Claims could not be loaded',
            message: error instanceof Error ? error.message : 'The profile claims could not be loaded.',
          })
        }
        return
      }

      if (cancelled) return
      setProfileState({
        state: 'loaded',
        profile: session.profile,
        claims,
        access: session.access,
      })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setProfileState({
          state: 'error',
          title: 'This profile could not be opened',
          message: error instanceof Error ? error.message : 'The selected profile could not be opened.',
        })
      }
    })

    return () => {
      cancelled = true
      void dispose?.().catch((error: unknown) => {
        console.error('Could not close the profile storage session.', error)
      })
    }
  }, [profileId])

  function selectClaim(claim: Claim) {
    onNavigate(`/claims?profile=${encodeURIComponent(profileId)}&claim=${encodeURIComponent(claim.id)}`)
  }

  async function removeClaim(claim: Claim) {
    await deleteProfileClaim(profileId, claim.id)
    setProfileState((current) => current.state === 'loaded'
      ? { ...current, claims: current.claims.filter((item) => item.id !== claim.id) }
      : current)
    setClaimToDelete(undefined)
    onNavigate(`/claims?profile=${encodeURIComponent(profileId)}`)
  }

  const selectedClaimId = profileState.state === 'loaded'
    ? claimId ?? profileState.claims[0]?.id
    : claimId
  const selectedClaim = profileState.state === 'loaded'
    ? profileState.claims.find((claim) => claim.id === selectedClaimId)
    : undefined

  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="xl">
        <Stack gap="xs">
          <nav aria-label="Breadcrumb">
            <Breadcrumbs>
              <Anchor
                href="/"
                onClick={(event) => {
                  event.preventDefault()
                  onNavigate('/')
                }}
              >
                Profiles
              </Anchor>
              {profileState.state === 'loaded' && (
                <Text component="span">{profileState.profile.label}</Text>
              )}
              <Text aria-current="page">Claims</Text>
            </Breadcrumbs>
          </nav>
          <Title order={1}>Claims overview</Title>
        </Stack>

        {profileState.state === 'loading' && (
          <Group>
            <Loader size="sm" />
            <Text aria-live="polite">Opening profile and checking access...</Text>
          </Group>
        )}

        {profileState.state === 'error' && (
          <Alert color="red" title={profileState.title}>
            <Stack gap="sm">
              <Text>{profileState.message}</Text>
              <Text>No other profile was opened and no profile data was changed.</Text>
              <Group>
                <Button variant="light" onClick={onRetry}>Retry opening profile</Button>
                <Button onClick={() => onNavigate('/')}>Return to profiles</Button>
              </Group>
            </Stack>
          </Alert>
        )}

        {profileState.state === 'loaded' && (
          <>
            <Text component="output" aria-live="polite">
              Profile: <strong>{profileState.profile.label}</strong>
            </Text>
            {profileState.access.mode === 'read-only' && (
              <Alert color="yellow" role="note" title="Profile is read-only">
                {profileState.access.persistence === 'denied'
                  ? 'Persistent storage was not granted.'
                  : profileState.access.persistence === 'unavailable'
                    ? 'This browser cannot verify persistent storage.'
                    : profileState.access.persistence === 'unknown'
                      ? 'The persistent-storage status is unknown.'
                      : 'Checking persistent storage failed.'}{' '}
                Simulated sync is not connected. You can view this profile, but profile-content changes are blocked.
                The local data is not protected or backed up.
              </Alert>
            )}
            {claimId && !selectedClaim && (
              <Alert color="yellow" title="The selected claim is unavailable">
                <Stack gap="sm">
                  <Text>Choose an available claim from this profile. No other profile's claims are shown.</Text>
                  <Button variant="light" onClick={() => onNavigate(`/claims?profile=${encodeURIComponent(profileId)}`)}>
                    Return to claims overview
                  </Button>
                </Stack>
              </Alert>
            )}
            <Grid>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <ClaimSidebar
                  claims={profileState.claims}
                  selectedClaimId={selectedClaimId}
                  onSelect={selectClaim}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <ClaimOverview
                  claim={selectedClaim}
                  canDelete={profileState.access.mode === 'read-write'}
                  onDelete={selectedClaim ? () => setClaimToDelete(selectedClaim) : undefined}
                />
              </Grid.Col>
            </Grid>
          </>
        )}
      </Stack>
      {claimToDelete && (
        <ConfirmDeletionDialog
          itemType="claim"
          name={claimToDelete.identifier}
          onClose={() => setClaimToDelete(undefined)}
          onConfirm={() => removeClaim(claimToDelete)}
        />
      )}
    </Container>
  )
}
