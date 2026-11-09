import type { StorageSession } from './local-storage'

export async function createActivitySchema(execute: StorageSession['execute']) {
  await execute(`
    CREATE TABLE activities (
      id TEXT PRIMARY KEY NOT NULL,
      claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      activity_date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('employer_contact', 'worksource_activity', 'other_activity')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      job_title_or_reference TEXT,
      employer_name TEXT,
      contact_method TEXT CHECK (contact_method IN ('in_person', 'online', 'phone', 'email', 'mail', 'other')),
      contact_method_other TEXT,
      contact_type TEXT CHECK (contact_type IN ('application_resume', 'interview', 'inquiry')),
      employer_address TEXT,
      employer_city TEXT,
      employer_state TEXT,
      employer_website_or_email TEXT,
      employer_phone TEXT,
      activity_description TEXT,
      documentation_description TEXT,
      worksource_office_name TEXT,
      worksource_city TEXT,
      worksource_state TEXT,
      CHECK (
        kind <> 'employer_contact' OR (
          job_title_or_reference IS NOT NULL AND length(trim(job_title_or_reference)) > 0
          AND employer_name IS NOT NULL AND length(trim(employer_name)) > 0
          AND contact_method IS NOT NULL AND contact_type IS NOT NULL
          AND (
            (employer_address IS NOT NULL AND length(trim(employer_address)) > 0)
            OR (employer_website_or_email IS NOT NULL AND length(trim(employer_website_or_email)) > 0)
            OR (employer_phone IS NOT NULL AND length(trim(employer_phone)) > 0)
          )
        )
      ),
      CHECK (
        kind = 'employer_contact' OR (
          job_title_or_reference IS NULL AND employer_name IS NULL
          AND contact_method IS NULL AND contact_method_other IS NULL AND contact_type IS NULL
          AND employer_address IS NULL AND employer_city IS NULL AND employer_state IS NULL
          AND employer_website_or_email IS NULL AND employer_phone IS NULL
        )
      ),
      CHECK (
        contact_method IS NOT 'other' OR (
          contact_method_other IS NOT NULL AND length(trim(contact_method_other)) > 0
        )
      ),
      CHECK (contact_method IS 'other' OR contact_method_other IS NULL),
      CHECK (
        kind = 'employer_contact' OR (
          activity_description IS NOT NULL AND length(trim(activity_description)) > 0
        )
      ),
      CHECK (
        kind <> 'employer_contact' OR (
          activity_description IS NULL AND documentation_description IS NULL
        )
      ),
      CHECK (
        kind = 'worksource_activity' OR (
          worksource_office_name IS NULL AND worksource_city IS NULL AND worksource_state IS NULL
        )
      )
    )
  `)
  await execute('CREATE INDEX activities_claim_date ON activities(claim_id, activity_date, id)')
}
