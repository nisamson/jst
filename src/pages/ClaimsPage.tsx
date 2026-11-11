import { lazy, Suspense, useEffect, useState } from 'react'
import { Alert, Anchor, Breadcrumbs, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { openProfile } from '../storage/profiles'
import type { ProfileSession } from '../storage/profiles'
import { deleteProfileClaim, listClaims, saveProfileClaim } from '../storage/claims'
import type { Claim, ClaimInput } from '../storage/claims'
import ClaimsWorkspace from '../components/ClaimsWorkspace'
import { developerToolsEnabled } from '../storage/developer-tools'
import AdvancedDetails from '../components/AdvancedDetails'

const DeveloperClaimsTools = developerToolsEnabled()
  ? lazy(() => import('../components/DeveloperClaimsTools'))
  : undefined

type ProfileState =
  | { state: 'loading' }
  | {
    state: 'loaded'
    profile: ProfileSession['profile']
    claims: Claim[]
    access: ProfileSession['access']
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
      <Container component="main" size="var(--app-content-width)" px={{ base: 0, sm: 'md' }} py="xl">
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
  const [dummyRevision, setDummyRevision] = useState(0)

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

  async function removeClaim(claim: Claim) {
    await deleteProfileClaim(profileId, claim.id)
    setProfileState((current) => current.state === 'loaded'
      ? { ...current, claims: current.claims.filter((item) => item.id !== claim.id) }
      : current)
  }

  async function saveClaim(input: ClaimInput, id?: string) {
    const claim = await saveProfileClaim(profileId, input, id)
    setProfileState((current) => current.state === 'loaded'
      ? {
        ...current,
        claims: [...current.claims.filter((item) => item.id !== claim.id), claim]
          .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)),
      }
      : current)
    return claim
  }

  async function changeDummyClaims(action: 'add' | 'remove') {
    if (!developerToolsEnabled()) return
    const tools = await import('../storage/developer-claims')
    const claims = await tools.changeDummyClaims(profileId, action)
    setProfileState((current) => current.state === 'loaded' ? { ...current, claims } : current)
    setDummyRevision((value) => value + 1)
    if (action === 'remove' && claimId && profileState.state === 'loaded'
      && profileState.claims.some((claim) => claim.id === claimId)
      && !claims.some((claim) => claim.id === claimId)) {
      onNavigate(`/claims?profile=${encodeURIComponent(profileId)}`)
    }
  }

  return (
    <Container component="main" size="var(--app-content-width)" px={{ base: 0, sm: 'md' }} py="xl">
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
          <Text c="dimmed">Review the claims stored in your selected local profile.</Text>
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
          <ClaimsWorkspace
            key={dummyRevision}
            profile={profileState.profile}
            access={profileState.access}
            claims={profileState.claims}
            claimId={claimId}
            onNavigate={onNavigate}
            onDelete={removeClaim}
            onSave={saveClaim}
          />
        )}
        {profileState.state === 'loaded' && DeveloperClaimsTools && (
          <AdvancedDetails>
            <Suspense fallback={null}>
              <DeveloperClaimsTools
                readOnly={profileState.access.mode === 'read-only'}
                onChange={changeDummyClaims}
              />
            </Suspense>
          </AdvancedDetails>
        )}
      </Stack>
    </Container>
  )
}
