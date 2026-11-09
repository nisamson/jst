import { listClaims } from './claims'
import { openProfile } from './profiles'
import { developerToolsEnabled } from './developer-tools'
import { normalizeActivity } from './activity-model'
import type { ActivityInput } from './activity-model'

const dummyActivities: ActivityInput[] = [
  {
    kind: 'employer_contact', activity_date: '2026-01-18',
    job_title_or_reference: 'Frontend developer', employer_name: 'Example Software',
    contact_method: 'online', contact_type: 'application_resume', employer_website_or_email: 'https://example.com/jobs',
  },
  {
    kind: 'worksource_activity', activity_date: '2026-01-03',
    activity_description: 'Resume workshop\nReviewed experience and practiced describing accomplishments.',
    documentation_description: 'Workshop completion email', worksource_office_name: 'Example online office',
  },
  {
    kind: 'other_activity', activity_date: '2025-12-28',
    activity_description: 'Practiced interview questions with a peer.',
  },
  {
    kind: 'employer_contact', activity_date: '2025-12-29',
    job_title_or_reference: 'Support engineer', employer_name: 'Example Services',
    contact_method: 'other', contact_method_other: 'Career fair conversation', contact_type: 'inquiry',
    employer_address: 'Example career fair booth', employer_city: 'Seattle', employer_state: 'WA',
  },
  {
    kind: 'other_activity', activity_date: '2026-01-01',
    activity_description: 'Practiced interview questions with a peer.', documentation_description: 'Personal preparation notes',
  },
]

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
      for (const [claimIndex, [id, identifier, createdAt, claimStartDate]] of dummyClaims.entries()) {
        if (action === 'add') {
          await session.execute(
            'INSERT INTO claims (id, identifier, created_at, claim_start_date) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
            [id, identifier, createdAt, claimStartDate],
          )
          // Keep the long-name claim empty, and reserve UUIDs for idempotent activity fixtures.
          if (claimIndex < 3) {
            for (const [activityIndex, input] of dummyActivities.entries()) {
              const details = normalizeActivity(input)
              const activity = {
                id: `dededede-0000-4000-8000-${String(claimIndex * 100 + activityIndex + 1).padStart(12, '0')}`,
                claim_id: id,
                created_at: '2026-01-19T12:00:00.000Z',
                updated_at: '2026-01-19T12:00:00.000Z',
                ...details,
              }
              const columns = Object.keys(activity)
              await session.execute(
                `INSERT INTO activities (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING`,
                Object.values(activity),
              )
            }
          }
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
