# User stories: claim and job-search activity management

## Status and scope

The app currently lists claims for a selected local profile, lets the user
select and view claim metadata, and supports claim creation, editing, and
confirmed deletion, plus claim-scoped activity creation, review, editing, and
deletion. Weekly grouping and activity search are future work; the activity fields and data
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
- An optional Overview holds plain-text overall notes or a description. Trim
  surrounding whitespace, preserve internal spacing and line breaks, and store
  blank/absent values as NULL. The create/edit form supports changing or clearing
  notes; the detail panel renders them as text, never HTML or Markdown.
- Claim identifiers are trimmed, must contain non-whitespace text, and may
  duplicate other identifiers. Internal whitespace is preserved, with no
  arbitrary length or format restriction and no ESD validation.
- The optional start date is trimmed and must be a real `YYYY-MM-DD` calendar
  date (years 0001–9999), or blank/absent to clear it. It is not converted
  through timezones. Future dates are permitted; no eligibility check is made.
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

- Additional claim fields.
- Activity search fields, match semantics, filters, sorting, and result
  presentation.
- Presentation details for the weekly view, including week labels and
  navigation between weeks.
- Attachments, export, provider integration, synchronization, and ESD filing
  remain separate feature work.

## Claims browsing design (#28, #33)

- Use a master-detail layout: a bordered claims navigation panel beside the
  selected claim on desktop, stacked above it below Mantine's `sm` breakpoint.
  Keep the list in normal document flow, without a nested scroll area.
- Retain newest-first ordering (creation timestamp descending, stable ID as
  tie-breaker) and automatically show the newest claim when the route has no
  claim ID. Explicit selections update the existing profile/claim query
  parameters, preserving direct links, reload, and browser back/forward.
- Each claim is a keyboard-operable selection button in a named navigation
  list, with `aria-pressed` indicating the current selection. Show its optional
  start date, and show the full stable record ID for duplicate identifiers so
  even claims with matching labels and dates can be distinguished. Wrap long
  identifiers rather than truncating them. Selection leaves focus on the
  button; the detail region announces the updated selection politely.
- The detail panel shows the identifier, stable record ID, original creation
  timestamp, optional start date, and the existing confirmed deletion action.
  Claim creation/editing controls are added by #29; activity entry remains
  separate work.
- Show profile context, claim count, and a read-only/view-and-edit badge above
  the workspace. Keep a Profiles breadcrumb and an explicit Switch profile
  action available. Read-only mode still permits selection, but disables
  deletion and retains the explanation of persistence and simulated sync.
- While opening a profile, show an announced loading state without old profile
  content. Storage errors replace the workspace, explain that no data changed,
  and offer retry or return to profiles. Retrying preserves the requested
  claim ID and rechecks access.
- A genuinely empty profile shows one empty-state panel directing users with
  write access to Create claim. An explicit missing claim ID instead shows the
  stale-selection warning, no claim metadata or deletion control, and a way
  to return to the newest available claim or select from the current profile.
  Never substitute another claim for an explicit unavailable selection.
- Keep profile sessions keyed by profile ID and retry attempt, so navigation
  cannot expose another profile's data or retain its deletion dialog.

## Claim lifecycle decisions (#29, #36–#41)

Create claim opens a Mantine modal containing an identifier and optional start
date. Date entry uses a Mantine-styled native date input, providing the browser's
calendar picker and localized keyboard entry while storing `YYYY-MM-DD` strings
without timezone conversion. An explicit Clear start date button unsets the
optional date; the change is persisted only on save. Incomplete or invalid input blocks saving rather
than silently clearing an existing date. Use date-picker inputs for editable
calendar dates rather than plain text fields.
Edit claim reuses that form, retaining the stable ID and original creation
timestamp. Saves select the saved claim via its existing direct-link route.
Cancel leaves stored data unchanged; failed saves retain entries and allow retry.
Read-only profiles disable create/edit/delete controls, and storage operations
recheck access when opening their own profile session.

Deletion still requires the exact identifier and now also shows the stable
record ID to distinguish duplicates. It explains that all associated activities
are removed. The foreign-key cascade and claim deletion run inside one explicit
transaction so even a failing activity trigger cannot leave a partial deletion.
Other claims, activities, profile metadata, and simulated sync state are retained.

The schema prerequisite #39 is included in this slice: version 4 introduces the
reviewed activities table/index, but no activity CRUD or entry UI. Writable
versions 1–3 migrate transactionally; read-only profiles remain on their existing
schema and are never migrated merely for viewing. Version 3 simulated setup
continues to permit opening and migrating a profile when persistence is denied.
Version 5 adds the nullable claim `overview` column transactionally, including
for existing version 4 profiles. Existing claims retain their identity and
metadata, with no overview until one is saved. Legacy read-only sessions select
an empty overview without attempting a schema change.

## Activity lifecycle decisions (#30, #42–#45)

The selected claim has an activity section below its overview, with a
newest-activity-date-first list and a detail panel for the selected record.
Matching entries show stable IDs and remain individually selectable. Activity
selection is local to this section; existing claim URLs and history are
unchanged. Switching claim/profile or reloading the section clears its selection,
forms, and pending dialogs. No weekly grouping or search is introduced here.

Add/edit uses one native-date-picker form with conditional fields for employer
contact, WorkSource activity, or other activity. Changing kind clears the
previous kind's entries in the form, with an explicit explanation; cancelling
never changes stored data. Saves validate and replace the entire applicable
field set atomically. Future dates and missing documentation descriptions show
non-blocking reminders. Optional text is clearable by emptying its field.

Activity deletion uses a simple confirmation identifying the activity, date,
and stable ID, with explicit Delete activity and Cancel actions. No typed
confirmation or undo is required. Cancelling leaves all records unchanged.
Successful deletion removes only that record; other activities and the owning
claim remain. Failures retain the dialog and record and allow retry or cancel.

Loading errors show an explicit retry state, not an empty activity list.
Reload activities rechecks stored data and access. Legacy read-only profiles
without an activities table display an empty read-only section without
migration. Every mutation opens a new profile session and rechecks write access,
even if the form was opened while the profile was writable.
