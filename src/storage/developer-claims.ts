import { listClaims } from './claims'
import { openProfile } from './profiles'
import { developerToolsEnabled } from './developer-tools'

const dummyClaims = [
  ['developer-dummy-claim-newest', 'Dummy claim 2026', '2026-03-01T12:00:00.000Z', '2026-02-01'],
  ['developer-dummy-claim-duplicate', 'Dummy claim 2026', '2026-02-01T12:00:00.000Z', null],
  ['developer-dummy-claim-older', 'Dummy claim 2025', '2025-03-01T12:00:00.000Z', '2025-02-01'],
  ['developer-dummy-claim-long', `Dummy long identifier ${'for layout testing '.repeat(8).trim()}`, '2025-01-01T12:00:00.000Z', null],
] as const

export async function changeDummyClaims(profileId: string, action: 'add' | 'remove') {
  if (!developerToolsEnabled()) throw new Error('Dummy claims are only available in development or local preview.')

  const session = await openProfile(profileId)
  try {
    if (session.access.mode !== 'read-write') {
      throw new Error('This profile is read-only. Dummy claims cannot be changed.')
    }
    await session.execute('BEGIN IMMEDIATE')
    try {
      for (const [id, identifier, createdAt, claimStartDate] of dummyClaims) {
        if (action === 'add') {
          await session.execute(
            'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
            [id, identifier, createdAt, claimStartDate],
          )
        } else {
          await session.execute('DELETE FROM claims WHERE id = ?', [id])
        }
      }
      const claims = await listClaims(session.execute)
      await session.execute('COMMIT')
      return claims
    } catch (error) {
      await session.execute('ROLLBACK')
      throw error
    }
  } finally {
    await session.dispose()
  }
}
