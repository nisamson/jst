# User story: profile, storage, and claim onboarding

## Story

As a job seeker with a Washington unemployment-insurance (UI) claim number,
I want to set up my profile and add my claim using existing storage or a
guided storage setup, so that my claim is ready for me to track job-search
activities.

The app supports one profile per installation and multiple claims for that
profile. The profile has a user-chosen name that need not be the job seeker's
real name. Local storage is required; connecting a cloud provider is optional.

## Journey

1. The user opens the app and enters a profile name if a profile has not
   already been set up.
2. The app reuses initialized local storage and an existing cloud connection
   when applicable. If local storage is not initialized, it guides the user
   through a storage wizard. The wizard initializes local storage and offers
   optional cloud setup.
3. The user enters their UI claim number. If it matches an existing claim, the
   app warns them and offers to open that claim or cancel creation.
4. Otherwise, the app creates the claim in the profile and opens it, ready for
   the user to work with it. If cloud setup was completed successfully, the
   provider is shown as connected.

The order and presentation of screens are not prescribed by this story. This
journey describes intended behavior, not functionality already implemented.

## Acceptance criteria

### Profile and claim

- A new profile requires a user-chosen profile name. The name is a profile
  label and is not required to be the user's real name.
- The app does not request or persist an SSN during onboarding. SSNs must never
  be persisted by the app. A future print/PDF export may allow the user to
  provide an SSN for that export without saving it in app storage.
- An existing profile is reused rather than replaced. The profile can contain
  multiple claims over time.
- Creating a claim requires a UI claim number. No unverified format or
  checksum rules are implied by this story.
- A new claim is associated with the profile, saved in local storage, and
  opened ready for subsequent work. Creating job-search activities is outside
  this story.
- If the entered claim number matches an existing claim, the app warns the
  user and offers to open the existing claim or cancel claim creation. Neither
  choice creates a duplicate or changes the existing claim.

### Storage setup and reuse

- The app reuses initialized local storage and an existing cloud connection
  where applicable without requiring the user to reinitialize storage.
- If local storage has not been initialized, a wizard guides the user through
  setup and provides an option to connect a cloud provider. The user can
  proceed with local storage without connecting a provider.
- A provider is shown as connected only after its authorization and setup
  succeed. If the user skips or cancels optional cloud setup, they can proceed
  locally after local storage has been initialized.
- If the required local SQLite/OPFS storage is unsupported, the app explains
  the limitation and blocks use rather than silently using an unsuitable
  fallback.
- If storage initialization or saving the profile or claim fails, the app
  reports the failure and does not present the affected step as completed.
  Cancelling or retrying setup must not overwrite existing records.
- If cloud authorization or setup fails, the app reports the failure and does
  not show the provider as connected. The user can retry or continue locally
  if local storage is ready.

## Open decisions and boundaries

- The provider to implement first, provider authorization details, and how
  existing cloud data is discovered or recovered on a new device remain open.
  This story does not promise that connecting a provider restores data.
- Synchronization, conflict resolution, and recovery guarantees remain
  unspecified. A connected provider does not by itself prove a cloud copy is
  current or recoverable.
- Exact claim-number validation and the rest of the claim data model remain
  open. Adding activities, filing a claim with ESD, and implementing the
  future print/PDF export are outside this story.

See the [proposed architecture](../architecture.md) for storage, offline, and
privacy considerations.
