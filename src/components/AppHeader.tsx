import { useState } from 'react'
import { Anchor, Button, Container, Group, Image, Text } from '@mantine/core'
import { IconSettings } from '@tabler/icons-react'
import SettingsDialog from './SettingsDialog'

export default function AppHeader() {
  const [settingsOpened, setSettingsOpened] = useState(false)
  return (
    <>
      <header className="app-header">
        <Container size="var(--app-content-width)" px={{ base: 'md', sm: 0 }} py="sm">
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Anchor href="/" c="inherit" underline="never">
              <Group wrap="nowrap" gap="sm">
                <Image src="/jst-logo.svg" alt="" w={36} h={36} />
                <Text fw={700} size="lg">Job Search Tracker</Text>
              </Group>
            </Anchor>
            <Button variant="subtle" leftSection={<IconSettings size={18} aria-hidden />}
              onClick={() => setSettingsOpened(true)}>Settings</Button>
          </Group>
        </Container>
      </header>
      {settingsOpened && <SettingsDialog onClose={() => setSettingsOpened(false)} />}
    </>
  )
}
