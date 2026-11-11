import { Anchor, Container, Group, Paper, Stack } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import disclaimer from '../content/disclaimer.md?raw'

export default function DisclaimerFooter({ position }: { position: 'top' | 'bottom' }) {
  return (
    <footer aria-label="Disclaimer" className={`disclaimer-footer disclaimer-footer--${position}`}>
      <Container size="var(--app-content-width)" px={{ base: 'md', sm: 0 }} py="xs">
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <div className="markdown-document disclaimer-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{disclaimer}</ReactMarkdown>
            </div>
            <Group gap="md">
              <Anchor href="/eula" size="sm">End User License Agreement</Anchor>
              <Anchor href="/privacy" size="sm">Privacy Policy</Anchor>
            </Group>
          </Stack>
        </Paper>
      </Container>
    </footer>
  )
}
