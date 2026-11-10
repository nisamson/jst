import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Button, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

const mobileQuery = '(max-width: 47.99375em)'

export default function MobileSectionDisclosure({ label, summary, initiallyExpanded = false, children }: {
  label: string
  summary: ReactNode
  initiallyExpanded?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const id = useId()
  const content = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const mobile = useMediaQuery(mobileQuery)

  useEffect(() => {
    if (mobile && !expanded && content.current?.contains(document.activeElement)) toggle.current?.focus()
    if (!mobile && document.activeElement === toggle.current) content.current?.focus()
  }, [mobile, expanded])

  return (
    <Stack gap="sm">
      <Box hiddenFrom="sm">
        <Text size="sm" lineClamp={2} style={{ overflowWrap: 'anywhere' }}>{summary}</Text>
        <Button ref={toggle} variant="subtle" size="sm" mih={44} px={0} aria-expanded={expanded} aria-controls={id}
          onBlur={(event) => {
            if (event.relatedTarget === null && !window.matchMedia(mobileQuery).matches) content.current?.focus()
          }}
          onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Hide' : 'Show'} {label}
        </Button>
      </Box>
      <Box ref={content} id={id} tabIndex={-1} className="mobile-disclosure-content" data-collapsed={!expanded}
        onBlurCapture={(event) => {
          // Chromium blurs CSS-hidden content before the media-query effect runs.
          if (!expanded && event.relatedTarget === null && window.matchMedia(mobileQuery).matches) toggle.current?.focus()
        }}>
        {children}
      </Box>
    </Stack>
  )
}
