import { expect, it } from 'vitest'
import { activityWarnings } from './activity-model'
import { downloadFilename, emptyEvidence, evidenceLimits, normalizeEvidenceLink, prepareEvidence, validateEvidence } from './evidence-model'
import type { EvidenceFile } from './evidence-model'

const link = { id: crypto.randomUUID(), label: ' Confirmation ', url: ' https://example.test/receipt ' }
const file: EvidenceFile = { id: crypto.randomUUID(), name: 'receipt.eml', type: 'message/rfc822', size: 4, description: '' }

it('allows optional labels and duplicate safe URLs, but rejects unsafe or credentialed links', () => {
  expect(normalizeEvidenceLink(link)).toEqual({ ...link, label: 'Confirmation', url: 'https://example.test/receipt' })
  expect(() => validateEvidence({ links: [link, { ...link, id: crypto.randomUUID(), label: '' }], files: [] })).not.toThrow()
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///secret', 'https://user:pass@example.test', '/relative', 'not a URL']) {
    expect(() => normalizeEvidenceLink({ ...link, url })).toThrow()
  }
  expect(() => normalizeEvidenceLink({ ...link, label: 'a'.repeat(201) })).toThrow(/200/)
  expect(() => normalizeEvidenceLink({ ...link, url: `https://example.test/${'a'.repeat(2048)}` })).toThrow(/2,048/)
})

it('enforces retained-plus-pending count and byte limits without depending on file types', () => {
  expect(() => validateEvidence({ links: [], files: [file] })).not.toThrow()
  expect(() => validateEvidence({ links: Array.from({ length: 21 }, () => ({ ...link, id: crypto.randomUUID() })), files: [] })).toThrow(/20/)
  expect(() => validateEvidence({ links: [], files: Array.from({ length: 11 }, () => ({ ...file, id: crypto.randomUUID() })) })).toThrow(/10 files/)
  expect(() => validateEvidence({ links: [], files: [{ ...file, size: evidenceLimits.fileBytes + 1 }] })).toThrow(/10 MiB/)
  expect(() => validateEvidence({ links: [], files: Array.from({ length: 3 }, () => ({ ...file, id: crypto.randomUUID(), size: evidenceLimits.fileBytes })) })).toThrow(/25 MiB/)
  expect(() => validateEvidence({ links: [], files: [{ ...file, description: 'a'.repeat(501) }] })).toThrow(/500/)
  expect(() => validateEvidence({ links: [], files: [file, file] })).toThrow(/duplicate ID/)
})

it('prepares only new file bytes, preserves retained files, and trims optional descriptions', async () => {
  const uploaded = new File(['mail'], 'receipt.eml', { type: 'message/rfc822' })
  const result = await prepareEvidence({
    links: [link],
    files: [file, { ...file, id: crypto.randomUUID(), description: ' Confirmation email ', file: uploaded }],
  })
  expect(result.files[0]).not.toHaveProperty('bytes')
  expect(result.files[1].bytes).toEqual(new TextEncoder().encode('mail'))
  expect(result.files[1].description).toBe('Confirmation email')
  await expect(prepareEvidence({ links: [], files: [{ ...file, size: 3, file: uploaded }] })).rejects.toThrow(/metadata/)
})

it('counts links or files as recorded evidence without claiming outside evidence is absent', () => {
  const activity = { kind: 'worksource_activity' as const, activity_date: '2026-01-01', activity_description: 'Workshop' }
  expect(activityWarnings(activity, '2026-01-01', emptyEvidence())[0]).toContain('evidence may exist outside the app')
  expect(activityWarnings(activity, '2026-01-01', { links: [link], files: [] })).toEqual([])
  expect(activityWarnings(activity, '2026-01-01', { links: [], files: [file] })).toEqual([])
})

it('makes download names inert path metadata and removes control/direction characters', () => {
  expect(downloadFilename('../receipt\\file\u0000\u202etxt. ')).toBe('.._receipt_file__txt')
  expect(downloadFilename('...')).toBe('attachment')
})
