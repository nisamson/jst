export const evidenceLimits = {
  files: 10,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 25 * 1024 * 1024,
  links: 20,
  label: 200,
  url: 2048,
  description: 500,
} as const

export type EvidenceLink = { id: string; label: string; url: string }
export type EvidenceFile = { id: string; name: string; type: string; size: number; description: string }
export type ActivityEvidence = { links: EvidenceLink[]; files: EvidenceFile[] }
export type EvidenceDraft = { links: EvidenceLink[]; files: (EvidenceFile & { file?: File })[] }
export type PreparedEvidence = { links: EvidenceLink[]; files: (EvidenceFile & { bytes?: Uint8Array })[] }

export function emptyEvidence(): ActivityEvidence {
  return { links: [], files: [] }
}

export function normalizeEvidenceLink(link: EvidenceLink): EvidenceLink {
  const label = link.label.trim()
  const url = link.url.trim()
  if (label.length > evidenceLimits.label) throw new Error('Link labels must be 200 characters or fewer.')
  if (!url || url.length > evidenceLimits.url) throw new Error('Enter a link URL of up to 2,048 characters.')
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error('Enter a complete HTTP or HTTPS link.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Links must use HTTP or HTTPS and must not contain embedded account credentials.')
  }
  return { id: link.id, label, url }
}

export function validateEvidence(evidence: ActivityEvidence) {
  if (evidence.links.length > evidenceLimits.links) throw new Error('An activity can have up to 20 links.')
  if (evidence.files.length > evidenceLimits.files) throw new Error('An activity can have up to 10 files.')
  for (const link of evidence.links) normalizeEvidenceLink(link)
  let total = 0
  const ids = new Set<string>()
  for (const item of [...evidence.links, ...evidence.files]) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) || ids.has(item.id)) {
      throw new Error('Evidence contains an invalid or duplicate ID. Reopen the activity and retry.')
    }
    ids.add(item.id)
  }
  for (const file of evidence.files) {
    if (!file.name || file.name.length > 255 || file.type.length > 255) {
      throw new Error('File names and declared types must be 255 characters or fewer, with a nonempty name.')
    }
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > evidenceLimits.fileBytes) {
      throw new Error('Each file must be 10 MiB or smaller.')
    }
    if (file.description.length > evidenceLimits.description) throw new Error('File descriptions must be 500 characters or fewer.')
    total += file.size
  }
  if (total > evidenceLimits.totalBytes) throw new Error('Files for one activity must total 25 MiB or less.')
}

export async function prepareEvidence(draft: EvidenceDraft): Promise<PreparedEvidence> {
  validateEvidence(draft)
  const files: PreparedEvidence['files'] = []
  for (const item of draft.files) {
    const { file, ...metadata } = item
    if (file && (file.name !== item.name || file.size !== item.size || file.type !== item.type)) {
      throw new Error('The selected file metadata has changed. Choose the file again.')
    }
    files.push({ ...metadata, description: metadata.description.trim(),
      ...(file ? { bytes: new Uint8Array(await file.arrayBuffer()) } : {}) })
  }
  return { links: draft.links.map(normalizeEvidenceLink), files }
}

export function downloadFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '_').replace(/[. ]+$/g, '') || 'attachment'
}

export function fileSizeLabel(size: number) {
  return size < 1024 ? `${size} bytes` : size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KiB` : `${(size / (1024 * 1024)).toFixed(1)} MiB`
}
