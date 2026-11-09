import type { StorageSession } from './local-storage'
import type { SqlRow } from './protocol'
import { emptyEvidence, normalizeEvidenceLink, validateEvidence } from './evidence-model'
import type { ActivityEvidence, EvidenceFile, EvidenceLink, PreparedEvidence } from './evidence-model'
import { openProfile } from './profiles'

function parseFile(row: SqlRow): EvidenceFile {
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.type !== 'string'
    || typeof row.size !== 'number' || typeof row.description !== 'string') {
    throw new Error('The activity contains invalid file metadata.')
  }
  return { id: row.id, name: row.name, type: row.type, size: row.size, description: row.description }
}

export async function listClaimEvidence(execute: StorageSession['execute'], claimId: string): Promise<Map<string, ActivityEvidence>> {
  const result = new Map<string, ActivityEvidence>()
  const [version] = await execute('PRAGMA user_version')
  if (typeof version?.user_version !== 'number' || version.user_version < 6) return result
  const links = await execute(`SELECT e.id, e.activity_id, e.label, e.url FROM activity_links e
    JOIN activities a ON a.id = e.activity_id WHERE a.claim_id = ? ORDER BY e.position, e.id`, [claimId])
  const files = await execute(`SELECT e.id, e.activity_id, e.name, e.type, e.size, e.description FROM activity_files e
    JOIN activities a ON a.id = e.activity_id WHERE a.claim_id = ? ORDER BY e.position, e.id`, [claimId])
  for (const row of [...links, ...files]) {
    if (typeof row.activity_id !== 'string') throw new Error('The evidence has invalid activity ownership.')
    const evidence = result.get(row.activity_id) ?? emptyEvidence()
    if ('url' in row) {
      if (typeof row.id !== 'string' || typeof row.label !== 'string' || typeof row.url !== 'string') {
        throw new Error('The activity contains an invalid link.')
      }
      evidence.links.push(normalizeEvidenceLink({ id: row.id, label: row.label, url: row.url }))
    } else evidence.files.push(parseFile(row))
    result.set(row.activity_id, evidence)
  }
  for (const evidence of result.values()) validateEvidence(evidence)
  return result
}

// Called only inside the owning activity save transaction.
export async function replaceEvidence(
  execute: StorageSession['execute'], claimId: string, activityId: string, input: PreparedEvidence,
): Promise<ActivityEvidence> {
  validateEvidence(input)
  const [owner] = await execute('SELECT id FROM activities WHERE id = ? AND claim_id = ?', [activityId, claimId])
  if (!owner) throw new Error('The activity no longer exists in this claim.')
  const existing = await execute('SELECT id, name, type, size, description FROM activity_files WHERE activity_id = ?', [activityId])
  for (const file of input.files) {
    if (file.bytes !== undefined) {
      if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength !== file.size) throw new Error('File contents do not match their recorded size.')
      if (existing.some((row) => row.id === file.id)) throw new Error('Existing file contents cannot be replaced. Remove the file and add it again.')
    } else {
      const saved = existing.find((row) => row.id === file.id)
      if (!saved || saved.name !== file.name || saved.type !== file.type || saved.size !== file.size) {
        throw new Error('A retained file is unavailable in this activity. Reopen the activity before retrying.')
      }
    }
  }
  await execute('DELETE FROM activity_links WHERE activity_id = ?', [activityId])
  const links: EvidenceLink[] = input.links.map(normalizeEvidenceLink)
  for (const [position, link] of links.entries()) {
    await execute('INSERT INTO activity_links (id, activity_id, position, label, url) VALUES (?, ?, ?, ?, ?)',
      [link.id, activityId, position, link.label, link.url])
  }
  for (const row of existing) {
    if (!input.files.some((file) => file.id === row.id)) await execute('DELETE FROM activity_files WHERE id = ? AND activity_id = ?', [row.id, activityId])
  }
  const files: EvidenceFile[] = []
  for (const [position, file] of input.files.entries()) {
    const metadata = { id: file.id, name: file.name, type: file.type, size: file.size, description: file.description.trim() }
    if (file.bytes !== undefined) {
      await execute('INSERT INTO activity_files (id, activity_id, position, name, type, size, description, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [file.id, activityId, position, file.name, file.type, file.size, metadata.description, file.bytes])
    } else {
      await execute('UPDATE activity_files SET position = ?, description = ? WHERE id = ? AND activity_id = ?',
        [position, metadata.description, file.id, activityId])
    }
    files.push(metadata)
  }
  return { links, files }
}

export async function readEvidenceFile(execute: StorageSession['execute'], claimId: string, activityId: string, fileId: string) {
  const [row] = await execute(`SELECT e.id, e.name, e.type, e.size, e.description, e.bytes FROM activity_files e
    JOIN activities a ON a.id = e.activity_id WHERE a.claim_id = ? AND a.id = ? AND e.id = ?`, [claimId, activityId, fileId])
  if (!row) throw new Error('The file is unavailable in this activity. Reload activities and retry.')
  const file = parseFile(row)
  validateEvidence({ links: [], files: [file] })
  if (!(row.bytes instanceof Uint8Array) || row.bytes.byteLength !== file.size) throw new Error('The file contents could not be read completely.')
  return { ...file, bytes: row.bytes }
}

export async function loadProfileEvidenceFile(profileId: string, claimId: string, activityId: string, fileId: string) {
  const session = await openProfile(profileId)
  try { return await readEvidenceFile(session.execute, claimId, activityId, fileId) } finally { await session.dispose() }
}
