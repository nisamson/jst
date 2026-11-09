import { MantineProvider } from '@mantine/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import ClaimsWorkspace from './ClaimsWorkspace'

const claims = [
  { id: 'newest', identifier: 'Same label', createdAt: '2026-03-01T12:00:00.000Z' },
  { id: 'older', identifier: 'Same label', createdAt: '2025-03-01T12:00:00.000Z' },
]

function renderWorkspace(overrides: Partial<ComponentProps<typeof ClaimsWorkspace>> = {}) {
  return renderToStaticMarkup(
    <MantineProvider>
      <ClaimsWorkspace
        profile={{ id: 'profile-one', label: 'My profile', createdAt: '2026-01-01T12:00:00.000Z' }}
        access={{ mode: 'read-write', persistence: 'granted', syncConnected: false }}
        claims={claims}
        onNavigate={vi.fn()}
        onDelete={vi.fn()}
        onSave={vi.fn()}
        {...overrides}
      />
    </MantineProvider>,
  )
}

it('distinguishes duplicate identifiers and selects an explicit stable ID instead of the newest record', () => {
  const html = renderWorkspace({ claimId: 'older' })

  expect(html).toMatch(/aria-label="Same label, Entry 1"[^>]*aria-pressed="false"/)
  expect(html).toMatch(/aria-label="Same label, Entry 2"[^>]*aria-pressed="true"/)
  expect(html).toContain('Selected claim: Same label, Entry 2')
  expect(html).not.toContain('Selected claim: Same label, record')
  expect(html).toMatch(/id="claim-overview-heading"[^>]*>Same label overview<\/h2>/)
  expect(html).toContain('2025-03-01T12:00:00.000Z')
})

it('does not present a stale selection as an empty profile or substitute another claim', () => {
  const html = renderWorkspace({ claimId: 'missing' })

  expect(html).toContain('The selected claim is unavailable')
  expect(html).not.toContain('No claims yet')
  expect(html).not.toContain('Selected claim:')
  expect(html).not.toContain('Delete claim')
  expect(html).not.toContain('aria-pressed="true"')
})

it('shows only one empty state and no claim actions for an empty profile', () => {
  const html = renderWorkspace({ claims: [] })

  expect(html.match(/No claims yet/g)).toHaveLength(1)
  expect(html).toContain('Use Create claim to add your first record')
  expect(html).not.toContain('Delete claim')
  expect(html).not.toContain('aria-label="Claims"')
})

it('keeps the newest claim viewable but disables deletion in read-only mode', () => {
  const html = renderWorkspace({
    access: { mode: 'read-only', persistence: 'denied', syncConnected: false },
  })

  expect(html).toContain('Selected claim: Same label, Entry 1')
  expect(html).toContain('profile-content changes are blocked.')
  expect(html).toMatch(/<button[^>]*disabled[^>]*title="This profile is read-only."/)
})
