# User story: local profile and storage onboarding

## Story

As a job seeker, I want to create or reopen a local profile using existing
storage or guided setup, so that I can reach my profile's claims overview.

The app supports multiple local profiles per installation, each in a separate
SQLite database, and multiple claims per profile. A profile has a required
user-chosen label that need not be the job seeker's real name. An optional
real name is stored once per profile for use across its claims, not shared
across unrelated profiles. Local storage is required; cloud setup is optional.
This milestone uses a clearly labeled simulated cloud provider, not a real
cloud connection. Claim creation is deferred.

## Journey

1. The app checks required local-storage capabilities. If unsupported, it
   explains the limitation and blocks storage-dependent use.
2. The landing page lists known local profiles and offers profile creation.
   The user selects an existing profile or enters a new profile label and
   optionally a real name.
3. Creation initializes a separate database without replacing existing
   profiles. The app offers optional simulated cloud setup after saving.
4. The user can complete simulated setup, skip/cancel it, or continue locally
   after a reported setup failure.
5. The app opens `/claims` for that profile. A new profile has an empty
   overview; returning profiles can show existing claims. No claim-creation
   step or job-search activity entry is included in this milestone.

The order and presentation of screens are not prescribed by this story. This
journey describes intended behavior. The app currently implements SQLite/OPFS
storage, multiple local profile persistence and discovery, profile creation,
and a profile-scoped empty claims overview. Simulated cloud setup and claims
listing are not yet implemented.

## Acceptance criteria

### Profiles and claims overview

- A new profile requires a user-chosen profile name. The name is a profile
  label and is not required to be the user's real name.
- The app does not request or persist an SSN during onboarding. SSNs must never
  be persisted by the app. A future print/PDF export may allow the user to
  provide an SSN for that export without saving it in app storage.
- Existing profiles are discovered and reused rather than replaced. Creating
  another profile never overwrites an existing database.
- Optional real name and other profile-wide settings apply across that
  profile's claims. Profile switching must not leak records or setup state.
- Onboarding finishes at the selected profile's claims overview, including a
  useful empty state for profiles without claims.
- Claim creation, claim-number validation, duplicate-claim handling, and
  job-search activity creation are outside this milestone.

### Storage setup and reuse

- The app reuses initialized local storage and successful simulated setup
  state per profile without requiring reinitialization.
- If local storage has not been initialized, a wizard guides the user through
  setup and offers optional simulated cloud setup. The user can proceed
  locally without connecting a provider.
- A simulated provider is shown as connected only after simulated
  authorization and setup succeed, with simulation clearly labeled.
  Listing simulated cloud profiles does not restore, merge, or import data.
  If the user skips/cancels setup, they can proceed locally after saving.
- If the required local SQLite/OPFS storage is unsupported, the app explains
  the limitation and blocks use rather than silently using an unsuitable
  fallback.
- If storage initialization or saving the profile fails, the app
  reports the failure and does not present the affected step as completed.
  Cancelling or retrying setup must not overwrite existing records.
- Persistent browser storage is requested where supported. Denied, unavailable,
  or failing permission APIs produce a warning without claiming durability.
  Even a grant does not guarantee backup or prevent explicit data clearing.
- If simulated authorization or setup fails, the app reports the failure and
  does not show the provider as connected. The user can retry or continue
  locally if local storage is ready.

## Open decisions and boundaries

- The real provider to implement first, authorization details, and how
  existing cloud data is discovered or recovered on a new device remain open.
  This story does not promise that connecting a provider restores data.
- Synchronization, conflict resolution, and recovery guarantees remain
  unspecified. A connected provider does not by itself prove a cloud copy is
  current or recoverable.
- Exact claim-number validation and the claim data model remain open.
  Before claim metadata is implemented, distinguish app record creation time
  from the optional user-entered claim date rather than guessing semantics.
  Claim creation/duplicate handling, activities, filing with ESD, and
  print/PDF export are outside this story.

See the [proposed architecture](../architecture.md) for storage, offline, and
privacy considerations.
