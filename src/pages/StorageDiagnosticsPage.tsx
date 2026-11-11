import { Anchor, Code, Container, Stack, Text, Title } from '@mantine/core'
import StorageStatus from '../components/StorageStatus'
import StorageProbe from '../components/StorageProbe'
import { useDisplaySettings } from '../components/display-settings-context'

export default function StorageDiagnosticsPage() {
  const { advanced } = useDisplaySettings()
  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="lg">
        <Anchor href="/">Back to app</Anchor>
        <Title order={1}>Storage diagnostics</Title>
        {advanced ? (
          <>
            <Text>
              Test real SQLite/OPFS storage in this browser. Checks use only
              {' '}<Code>/jst-storage-diagnostics.sqlite3</Code>, never profile databases.
              No personal information is requested or stored by these checks.
            </Text>
            <Text>
              This database holds one replaceable synthetic record. The URL carries
              its expected token, not a copy of the record. A different browser,
              device, or origin has separate storage. Passing here does not guarantee backup.
            </Text>
            <StorageStatus>
              <StorageProbe />
            </StorageStatus>
          </>
        ) : <Text>Enable Advanced display in Settings to use storage diagnostics.</Text>}
      </Stack>
    </Container>
  )
}
