# User stories: claim and job-search activity management

## Status and scope

The app currently lists claims for a selected local profile, lets the user
select and view claim metadata, and supports confirmed claim deletion. Claim
creation and editing are not implemented. Job-search activities, weekly
grouping, and activity search are future work; the activity fields and data
rules are defined in the [job-search activity data model](../job-search-data-model.md).

Claims and activities are separate records. A claim belongs to one profile;
each activity belongs to one claim. Weekly grouping and search apply to
activities within the selected claim, not to claim records.

## Stories

### Browse existing claims

As a job seeker, I want to see and select claims in my profile, so that I can
review the details and job-search activities for the claim I choose.

### Create and maintain claim records

As a job seeker, I want to create and update claim records, so that the claims
I manage and their identifying details stay current.

As a job seeker, I want to deliberately confirm claim deletion, so that I can
avoid accidentally removing a claim and its associated job-search activities.

### Record job-search activities

As a job seeker, I want to add, review, correct, and remove job-search
activities within a claim, so that I can maintain my own job-search log.

### Review activities by job-search week

As a job seeker, I want my claim's activities organized by job-search week,
so that I can review the records for each filing period.

### Search activities in a claim

As a job seeker, I want to search activities in the selected claim, so that I
can find a particular record without reviewing every week.

## Acceptance criteria

### Claims overview and selection

- The claims overview shows only claims from the selected profile. Switching
  profiles never exposes another profile's claims.
- Each claim can be selected independently of its display identifier; the
  stable claim ID identifies the record, including when identifiers are
  duplicated.
- The overview shows the claim identifier, the app record creation timestamp,
  and the optional user-entered claim start date. The creation timestamp and
  start date are distinct; a missing start date is shown as not provided.
- Selecting a claim displays that claim's metadata and activities. A stale or
  unavailable selection does not display another claim's data.
- A profile with no claims has a useful empty state and an available way to
  create a claim when the user has write access.
- Read-only access continues to allow viewing, but prevents creating,
  modifying, or deleting claim and activity records.

### Claim record lifecycle

- A new claim is saved only in the selected profile. Its display identifier
  and optional claim start date use the existing claim fields; the app assigns
  and preserves a stable record ID.
- The user can change the identifier and set, change, or clear the optional
  start date. Editing does not replace the record ID or change the original
  app record creation timestamp.
- Claim identifier validation and duplicate-identifier policy are not
  established by this story; the implementation must not silently invent a
  uniqueness rule or imply ESD validation.
- Deletion requires explicit confirmation identifying the claim. The
  confirmation explains that all activities belonging to the claim will also
  be deleted. Cancelling leaves the claim and its activities unchanged.
- Claim deletion targets the selected claim by stable ID, not by identifier.
  A failed delete is reported, leaves data available, and allows retry.
- A successful deletion removes the claim and its activities atomically and
  returns the user to the profile's claims overview.

### Activity lifecycle

- Activities can be created, viewed, corrected, and removed only within the
  selected claim and profile. Editing or deleting one activity does not affect
  other activities or claims.
- Each saved activity has a valid calendar date and one supported kind:
  employer contact, WorkSource activity, or other activity. Required and
  kind-specific fields, text normalization, optional values, and warnings
  follow the [activity data model](../job-search-data-model.md).
- There is no incomplete-draft state. All required details must be valid to
  save; future-date and missing-documentation warnings are non-blocking.
- Editing preserves the activity's stable ID, owning claim, and creation time,
  and updates its last-edit timestamp. Changing kind replaces the applicable
  details as one complete change; fields that do not apply to the new kind
  are cleared.
- Repeated or matching activity details remain separate records; the app
  neither blocks nor automatically deduplicates them.
- Save, update, and delete failures are reported without presenting the
  operation as successful or discarding the user's existing record.

### Weekly activity view

- Activities are grouped within their claim by the week derived from
  `activity_date`: Sunday through Saturday, inclusive.
- Week grouping uses the activity's calendar date, not app-created or
  last-edited timestamps, and does not shift date-only values across
  timezones.
- Changing an activity date moves it to the week derived from the new date.
- The app does not store a separately editable week-ending value or create a
  weekly-log record. There is no weekly activity-count limit.
- An empty claim and a week with no matching activities have clear empty
  states.

### Activity search

- Search is limited to activities belonging to the currently selected claim
  in the selected profile; it does not search claim identifiers, other claims,
  or other profiles.
- Results identify the matching activities and their dates/weeks, and let the
  user open the matching record for review or editing when write access is
  available.
- Clearing the search restores the unfiltered weekly view. No-match and
  cleared-search states are distinguishable from a claim with no activities.
- Search uses local profile data and does not require network access.
- Searchable fields, matching rules, filters, sorting, and whether search
  results retain weekly grouping remain open decisions; do not imply a
  particular search syntax or filter set until specified.

## Privacy and product boundaries

- The app records the user's own job-search information. It does not determine
  eligibility, decide whether an activity counts toward an ESD requirement,
  or file anything with ESD.
- The app must never request or persist an SSN as part of claim or activity
  management. No additional claimant ID/SSN field is introduced here.
- Local claim and activity data remains isolated in the selected profile's
  database. Read-only and storage failure behavior follow the existing
  [onboarding story](onboarding.md).
- Offline access and local saving do not imply cloud synchronization,
  cross-device recovery, backup, or guaranteed durability.

## Open decisions and boundaries

- Claim identifier validation, duplicate-identifier handling, and any
  additional claim fields.
- Activity search fields, match semantics, filters, sorting, and result
  presentation.
- Activity deletion confirmation and undo behavior.
- Presentation details for the weekly view, including week labels and
  navigation between weeks.
- Attachments, export, provider integration, synchronization, and ESD filing
  remain separate feature work.
