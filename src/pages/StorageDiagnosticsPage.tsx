import { Anchor, Code, Container, Stack, Text, Title } from '@mantine/core'
import StorageStatus from '../components/StorageStatus'
import StorageProbe from '../components/StorageProbe'

export default function StorageDiagnosticsPage() {
  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="lg">
        <Anchor href="/">Back to app</Anchor>
        <Title order={1}>Storage diagnostics</Title>
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
      </Stack>
    </Container>
  )
}
