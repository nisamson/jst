import { useState } from 'react'
import { Button, Modal, Stack, Text } from '@mantine/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import disclaimer from '../content/disclaimer.md?raw'

const acknowledgmentKey = 'jst-disclaimer-acknowledgment'
const acknowledgment = `${import.meta.env.VITE_APP_VERSION}\n${disclaimer}`

export default function DisclaimerDialog() {
  const [opened, setOpened] = useState(() => {
    try {
      return localStorage.getItem(acknowledgmentKey) !== acknowledgment
    } catch {
      return true
    }
  })

  function acknowledge() {
    try {
      localStorage.setItem(acknowledgmentKey, acknowledgment)
    } catch {
      // Storage restrictions must not prevent using the app for this visit.
    }
    setOpened(false)
  }

  return (
    <Modal opened={opened} title="Before you use Job Search Tracker" onClose={() => {}}
      centered closeOnEscape={false} closeOnClickOutside={false} withCloseButton={false}>
      <Stack gap="md">
        <div className="markdown-document">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{disclaimer}</ReactMarkdown>
        </div>
        <Text size="sm" c="dimmed">
          Your acknowledgment is saved only in this browser, not in a profile or synced to other devices.
          You will see this again after an app update, a disclaimer change, or if site storage is cleared or expires.
          If browser storage is unavailable, it may appear again on your next visit.
        </Text>
        <Button data-autofocus onClick={acknowledge}>I understand</Button>
      </Stack>
    </Modal>
  )
}
