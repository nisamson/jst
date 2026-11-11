import { Anchor, Container, Paper, Stack } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function LegalDocumentPage({ content }: { content: string }) {
  return (
    <Container component="main" size="var(--app-content-width)" py="xl">
      <Stack gap="md">
        <Anchor href="/">Return to the job search tracker</Anchor>
        <Paper component="article" withBorder p={{ base: 'md', sm: 'xl' }} radius="md">
          <div className="markdown-document">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </Paper>
      </Stack>
    </Container>
  )
}
