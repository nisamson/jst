import { useEffect, useState } from 'react'
import { Alert, Button, Container, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { openProfile } from '../storage/profiles'
import type { Profile } from '../storage/profiles'

type ProfileState =
  | { state: 'loading' }
  | { state: 'loaded'; profile: Profile }
  | { state: 'error'; message: string }

export default function ClaimsPage({
  profileId,
  onNavigate,
}: {
  profileId?: string
  onNavigate: (path: string) => void
}) {
  const [attempt, setAttempt] = useState(0)

  if (!profileId) {
    return (
      <Container component="main" size="md" py="xl">
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
      onRetry={() => setAttempt((value) => value + 1)}
      onNavigate={onNavigate}
    />
  )
}

function ClaimsOverview({
  profileId,
  onRetry,
  onNavigate,
}: {
  profileId: string
  onRetry: () => void
  onNavigate: (path: string) => void
}) {
  const [profileState, setProfileState] = useState<ProfileState>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    let dispose: (() => Promise<void>) | undefined

    openProfile(profileId).then((session) => {
      if (cancelled) {
        void session.dispose().catch((error: unknown) => {
          console.error('Could not close the profile storage session.', error)
        })
        return
      }

      dispose = session.dispose
      setProfileState({ state: 'loaded', profile: session.profile })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setProfileState({
          state: 'error',
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

  return (
    <Container component="main" size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between">
          <Title order={1}>Claims overview</Title>
          <Button variant="light" onClick={() => onNavigate('/')}>Change profile</Button>
        </Group>

        {profileState.state === 'loading' && (
          <Group>
            <Loader size="sm" />
            <Text aria-live="polite">Opening local profile...</Text>
          </Group>
        )}

        {profileState.state === 'error' && (
          <Alert color="red" title="This profile could not be opened">
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
            <Paper component="section" aria-labelledby="empty-claims-heading" withBorder p="lg" radius="md">
              <Stack gap="xs">
                <Title id="empty-claims-heading" order={2}>No claims yet</Title>
                <Text c="dimmed">Claims for this profile will appear here when available.</Text>
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  )
}
