# Job-search activity data model

## Status and scope

This is the reviewed design for #18. The version 4 activities schema and
transactional migration are implemented by #39 alongside claim lifecycle work.
Activity CRUD and entry UI, attachments, and ESD integration remain future work.

The app records information for the user's own log. It does not determine
eligibility, approve activities, assess compliance, or file anything with ESD.
Successfully saving an activity does not establish that its information is
complete for ESD or that the activity counts toward a requirement.

## Sources

The model was reviewed against the user-supplied official
[Washington ESD job-search log](https://esd.wa.gov/media/pdf/1045/esd-job-search-log-251110-accessiblepdf)
and ESD's
[job-search requirements and tracking guidance](https://esd.wa.gov/get-financial-help/unemployment-benefits/weekly-unemployment-claims/job-search-requirements).
The requirements page links that PDF and says an alternative log must include
the information required by the official form.

The supplied PDF is titled "WA ESD Job search log". Its printed footer is
`EMS 10313 CC 7540-032-823 Rev 111622`. Its filename contains `251110` and its
modification metadata says November 10, 2025; neither changes the printed
revision. The form provides three contact blocks, each supporting employer
contact, WorkSource activity, or other activity.

The fields below reflect the form; requiredness, warnings, and storage
boundaries are explicit application decisions. Official guidance can change
and remains authoritative. In particular, ESD says repeating the exact same
activity does not make it count multiple times. The app does not enforce that
policy by blocking matching records.

## Ownership and log header

Each activity belongs to exactly one claim, identified by that claim's stable
ID inside its profile's SQLite database. A claim's display identifier is not
a foreign key. Profile isolation is provided by the separate profile
databases; activities do not duplicate profile metadata.

Weeks run from Sunday at midnight through the end of Saturday. For date-only
records, this means Sunday through Saturday inclusive, including all of
Saturday's final minute. Derive the week-ending Saturday from the activity
date. Do not store an independently editable week-ending value or introduce
a weekly-log entity.

The log name comes from the profile's optional real name. Do not substitute
the profile label or duplicate the name on activities. Leave the form's
ID/SSN field blank: no new claimant identifier field is introduced, and SSN
must never be persisted.

There is no weekly record cap. The three paper slots are not a storage limit.
There is no content-based uniqueness constraint or automatic deduplication:
matching entries retain separate IDs without implying they count separately
for ESD.

## Shared fields

All shared fields are required and non-null.

| Field | Application type / SQLite type | Meaning and validation |
| --- | --- | --- |
| `id` | UUID string / TEXT | App-generated stable ID; never changes during an edit |
| `claim_id` | UUID string / TEXT | Existing owning claim's stable ID in this profile |
| `activity_date` | Calendar-date string / TEXT | Real calendar date in `YYYY-MM-DD` form |
| `kind` | String union / TEXT | `employer_contact`, `worksource_activity`, or `other_activity` |
| `created_at` | UTC timestamp string / TEXT | App-record creation time |
| `updated_at` | UTC timestamp string / TEXT | App-record last-edit time |

`activity_date` is user-entered and has no time or timezone. Do not parse it
as a UTC instant and shift it into another calendar day. Date edits move
the record into the week derived from the new date.

App timestamps use canonical UTC ISO 8601 strings, for example
`2026-11-09T03:00:00.000Z`. At creation, `updated_at` equals `created_at`.
Subsequent edits preserve `id` and `created_at` and set `updated_at` to the
edit time. These timestamps never determine weekly grouping.

The selected kind describes what the user recorded, not an ESD approval
determination. Future dates are permitted with a non-blocking warning,
comparing the activity date to today's local calendar date. There is no
claim-date or eligibility check that rejects past activity dates.

## Employer-contact fields

All fields below use text strings / SQLite TEXT. They are all NULL when the
kind is not `employer_contact`.

| Field | Requiredness and nullability | User-facing meaning |
| --- | --- | --- |
| `job_title_or_reference` | Required nonblank | One combined job-title or job-reference field, as on the form |
| `employer_name` | Required nonblank | Employer or business name |
| `contact_method` | Required selection | How the user made contact |
| `contact_method_other` | Required nonblank for `other`; NULL otherwise | Description of another contact method |
| `contact_type` | Required selection | Type of employer contact |
| `employer_address` | Individually optional / NULL | Employer's address |
| `employer_city` | Optional / NULL | Employer's city |
| `employer_state` | Optional / NULL | Employer's state |
| `employer_website_or_email` | Individually optional / NULL | One combined website or email field |
| `employer_phone` | Individually optional / NULL | Employer's phone number |

At least one of `employer_address`, `employer_website_or_email`, or
`employer_phone` must be nonblank. City/state alone do not satisfy this rule.

Choose exactly one contact method:

| Stored value | Label |
| --- | --- |
| `in_person` | In-person |
| `online` | Online |
| `phone` | By phone |
| `email` | By email |
| `mail` | By mail |
| `other` | Other |

Choose exactly one contact type:

| Stored value | Label |
| --- | --- |
| `application_resume` | Application/resume |
| `interview` | Interview |
| `inquiry` | Inquiry |

Email and mail are contact methods, not contact types. Single-method
selection is an application decision; the PDF explicitly says "Choose one"
for contact type, but not for method.

## WorkSource and other-activity fields

All fields below use text strings / SQLite TEXT.

| Field | WorkSource activity | Other activity | Employer contact |
| --- | --- | --- | --- |
| `activity_description` | Required nonblank | Required nonblank | NULL |
| `documentation_description` | Optional / NULL | Optional / NULL | NULL |
| `worksource_office_name` | Optional / NULL | NULL | NULL |
| `worksource_city` | Optional / NULL | NULL | NULL |
| `worksource_state` | Optional / NULL | NULL | NULL |

`activity_description` answers "What activity did you complete?"
`documentation_description` answers "What documentation do you have?" It
describes evidence, such as a completion email; it is not an attachment,
file path, or verification that evidence exists. WorkSource location fields
describe where the activity was completed and are optional, including for
online activities.

For either kind, a missing documentation description produces a non-blocking
reminder to retain supporting evidence. It does not prevent saving and must
not claim the user has no evidence: evidence may exist outside the app.
When attachment support is introduced, account for attached evidence so that
the eventual reminder applies when neither description nor supporting file
evidence is present. No attachment field or table is introduced here.

## Validation and editing

Trim surrounding whitespace, preserve meaningful internal text, reject blank
required text, and normalize absent or blank optional text to NULL.
Inapplicable kind-specific fields must also be NULL, not empty strings.

Phone, address, state, and combined website/email values remain flexible text.
Do not impose restrictive format checks or arbitrary field-length limits.
Real calendar dates, UUIDs, timestamp formats, and enum values are validated
at the data-access boundary; a date-shaped string alone is not sufficient
calendar validation.

All required fields must be satisfied to save a record. There is no
incomplete-draft state. Future-date and missing-documentation warnings do not
block saving and are derived, not persisted as warning flags.

Kind changes are allowed. Validate the replacement details, clear fields
that no longer apply, and save the complete change atomically. Preserve the
record's identity, owning claim, and creation time during a kind change.
Do not leave a partially converted record.

Confirmed deletion of a claim also deletes all of its activities. The confirmation
flow explains this consequence and applies deletion atomically. Deleting a profile continues to remove
that profile's database, including its activities.

## SQLite mapping

Use one `activities` table inside each profile database. Shared fields are
non-null; nullable detail columns are constrained according to kind. This
avoids detail-table joins and the additional invariant of exactly one matching
detail row, at the cost of unused columns and conditional checks.

The following DDL expresses the relational constraints implemented in
`src/storage/activity-schema.ts`. Future activity-service validation must handle canonical formats, actual
calendar validity, text normalization, and warning behavior.

```sql
CREATE TABLE activities (
  id TEXT PRIMARY KEY NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  activity_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('employer_contact', 'worksource_activity', 'other_activity')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  job_title_or_reference TEXT,
  employer_name TEXT,
  contact_method TEXT CHECK (
    contact_method IN ('in_person', 'online', 'phone', 'email', 'mail', 'other')
  ),
  contact_method_other TEXT,
  contact_type TEXT CHECK (
    contact_type IN ('application_resume', 'interview', 'inquiry')
  ),
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
      job_title_or_reference IS NOT NULL
      AND length(trim(job_title_or_reference)) > 0
      AND employer_name IS NOT NULL
      AND length(trim(employer_name)) > 0
      AND contact_method IS NOT NULL
      AND contact_type IS NOT NULL
      AND (
        (employer_address IS NOT NULL AND length(trim(employer_address)) > 0)
        OR (employer_website_or_email IS NOT NULL
            AND length(trim(employer_website_or_email)) > 0)
        OR (employer_phone IS NOT NULL AND length(trim(employer_phone)) > 0)
      )
    )
  ),
  CHECK (
    kind = 'employer_contact' OR (
      job_title_or_reference IS NULL AND employer_name IS NULL
      AND contact_method IS NULL AND contact_method_other IS NULL
      AND contact_type IS NULL AND employer_address IS NULL
      AND employer_city IS NULL AND employer_state IS NULL
      AND employer_website_or_email IS NULL AND employer_phone IS NULL
    )
  ),
  CHECK (
    contact_method IS NOT 'other' OR (
      contact_method_other IS NOT NULL
      AND length(trim(contact_method_other)) > 0
    )
  ),
  CHECK (contact_method IS 'other' OR contact_method_other IS NULL),
  CHECK (
    kind = 'employer_contact' OR (
      activity_description IS NOT NULL
      AND length(trim(activity_description)) > 0
    )
  ),
  CHECK (
    kind <> 'employer_contact' OR (
      activity_description IS NULL AND documentation_description IS NULL
    )
  ),
  CHECK (
    kind = 'worksource_activity' OR (
      worksource_office_name IS NULL
      AND worksource_city IS NULL AND worksource_state IS NULL
    )
  )
);

CREATE INDEX activities_claim_date
  ON activities(claim_id, activity_date, id);
```

The index supports claim-scoped date-range queries and an ID tie-breaker.
There is no content uniqueness constraint, stored week-ending value, or
duplicate profile/name data.

SQLite CHECK constraints accept NULL results, so conditional requiredness
uses explicit `IS NOT NULL` checks. Enum checks allow NULL in inapplicable
columns; the employer-requiredness check separately requires those selections.
SQLite's `trim` checks are a defensive minimum, not a replacement for the
service's whitespace normalization.

Foreign-key enforcement must be enabled on every relevant connection before
starting transactions. Declaring a foreign key does not by itself ensure
enforcement or cascading deletion.

## Migration and remaining implementation requirements

The current profile schema is version 5 in `src/storage/profiles.ts`.
Writable versions 1–3 migrate through their existing steps before creating
the activities table and index, preserving metadata, claims, and simulated
sync setup. The version 4-to-5 step adds nullable overall claim notes in the
`overview` column, without changing activity records. New profiles initialize
the same schema.

Foreign-key enforcement is enabled and verified before profile initialization,
migration, or profile-session use. No activities are invented or backfilled.
Discovery and read-only access retain their existing responsibilities; viewing
a read-only profile does not migrate it. Failures roll back rather than resetting
or replacing a database, and unsupported newer schema versions remain rejected.

Follow-up tests should cover each kind's required and inapplicable fields,
conditional contact details, blank normalization, valid calendar dates,
Sunday/Saturday and year-boundary grouping, future-date and evidence
warnings, kind replacement, duplicate records, ownership isolation,
cascading deletion, and migration preservation/rollback. Schema constraints,
cascading deletion, and migration preservation/rollback now have browser coverage;
activity-service validation, weekly grouping, and entry UI remain future work.

## Deferred decisions

Printed pagination, presentation of warnings, attachment modeling, and search
filters remain future feature work. Export must not imply that stored data
has been approved by or submitted to ESD.

Synchronization conflict resolution, deletion tombstones, and cross-device
clock handling remain separate sync design work. Device-generated UTC
timestamps are not trusted ordering or a complete conflict-resolution
strategy; do not infer those guarantees from this model.
