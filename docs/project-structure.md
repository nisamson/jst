# Project structure

This guide describes the checked-in application structure and points to the
right files for common changes. It is a navigation map, not a second
architecture specification; see [architecture](architecture.md) and the
[onboarding story](user-stories/onboarding.md) for product and data decisions.

## Application flow

`index.html` loads `src/main.tsx`. The entry point mounts React in `StrictMode`,
configures Mantine and shared header/settings/PWA/disclaimer chrome, and selects
`/diagnostics/storage`, `/eula`, or `/privacy` by pathname; other paths render
`src/App.tsx`. `App` handles profile selection and `/claims?profile=<id>`
navigation inside the `StorageStatus` capability boundary.

| Area | Location | Responsibility |
| --- | --- | --- |
| App shell | `src/App.tsx`, `src/main.tsx` | Root component, Mantine setup, page selection and lightweight history navigation |
| Pages | `src/pages/`, `src/components/LegalDocumentPage.tsx` | `ProfileLandingPage` discovers and creates profiles; `ClaimsPage` opens a selected profile; `StorageDiagnosticsPage` hosts storage diagnostics; `LegalDocumentPage` renders Markdown policies |
| UI components | `src/components/` | Reusable form, simulated setup dialog, and storage UI; storage status provides the persistence-request boundary |
| Storage and provider services | `src/storage/`, `src/sync/` | Profile persistence, profile-scoped simulated setup state, dummy-provider behavior, capability checks, and diagnostics data operations |
| SQLite worker | `src/storage/sqlite.worker.ts`, `src/storage/protocol.ts` | Worker-side SQLite WASM/OPFS operations and typed request/response messages |
| PWA shell | `vite.config.ts`, `pwa/service-worker.js`, `src/components/PwaStatus.tsx`, `public/pwa-*.svg` | Manifest, production service-worker precache, offline status, and staged update messaging |
| Tests | `src/**/*.test.ts`, `src/**/*.test.tsx`, `tests/browser/` | Vitest service/component tests and Playwright real-browser tests |
| Browser/build config | `vite.config.ts`, `playwright.config.ts`, `tsconfig*.json`, `.oxlintrc.json` | Vite workers/headers, browser projects, TypeScript, lint |
| Public assets | `public/`, `src/assets/` | Root-served assets and Vite-imported assets respectively |

## Data and UI boundaries

- React pages orchestrate user actions; they use services in `src/storage/`
  rather than issuing SQL themselves.
- `ClaimsPage` owns profile loading, retries, and claim data.
  `ClaimsWorkspace` composes profile access context, `ClaimSidebar` navigation,
  `ClaimOverview` details, `ClaimFormDialog` create/edit forms, empty/stale states,
  and confirmed deletion.
- `MobileSectionDisclosure` keeps claim navigation, claim overview, and week
  navigation compact below Mantine's `sm` breakpoint (48em). Activity details
  initially expand after selection and can also collapse. Summaries and record
  actions remain visible; contents stay mounted to retain navigation and form
  state. Desktop always displays section contents.
- `ClaimActivities` owns selected-claim activity loading/retries, week/record
  selection, and mutation state. It composes `ActivityWeekNavigator` (paged
  overview with gaps), `ActivityWeekControls` (week/date navigation),
  `ActivityList`, `ActivityDetails`, `ActivityFormDialog`, and
  `DeleteActivityDialog`, keyed by profile and claim to prevent stale content.
- `src/storage/activity-weeks.ts` derives date-only Sunday–Saturday weeks and
  activity groups without persisting weeks or allocating empty history entries.
- `src/storage/activity-model.ts` defines activity types, normalization,
  validation, labels, and non-blocking local-calendar/evidence warnings.
  `src/storage/activities.ts` implements claim-scoped reads and transactional
  CRUD, validates stored metadata, and rechecks profile write access.
- `EvidenceEditor` manages draft links, files, and optional file descriptions
  inside the activity form; `EvidenceDetails` provides safe links and deliberate
  downloads. `src/storage/evidence-model.ts` defines limits and validation;
  `evidence-schema.ts` defines the v6 link/file tables and cascading ownership;
  `evidence.ts` loads metadata, replaces evidence inside the activity save
  transaction, and retrieves scoped blob bytes only on demand.
- `src/storage/claims.ts` normalizes claim input and provides transactional
  create/update/delete operations. `src/storage/activity-schema.ts` defines the
  version 4 activity table/index; profile initialization and migration share it.
- `src/storage/profiles.ts` owns profile create/list/open operations. Each
  profile has a stable ID and a separate SQLite database in OPFS.
- `ExportProfileDialog` offers a local SQLite download for each readable
  profile. `profiles.ts` opens the source without migration, and
  `sqlite-export.ts` uses SQLite backup to create an in-memory snapshot,
  verifies its known schema, removes local sync setup, compacts it, and checks
  integrity before downloading. The export is unencrypted and includes personal
  records and attachments. `ImportProfileDialog` restores a selected backup
  locally as a separate profile with a new ID and a restored-copy label, never
  replacing or merging existing profiles. `sqlite-import.ts` reads the backup
  in a read-only in-memory connection with trusted schema disabled, checks its
  schema/integrity and record/evidence rules, and copies only known records into
  freshly created current-schema tables. It never installs uploaded schema,
  triggers, or sync setup. Supported legacy backups restore into the current
  schema without changing the source file. Restore commits atomically and
  removes its newly created file on failure after closing the worker.
  Both operations currently require full snapshot buffers; hundreds-of-megabytes
  profiles have not been validated. Update the shared schema allowlist and
  export sanitization/import mapping when profile schemas change.
- `src/storage/simulated-sync-state.ts` persists successful simulated setup
  inside that profile database; `src/sync/simulated-provider.ts` is a
  display-only dummy provider and never transfers profile data.
  Profile discovery reports each setup state separately from profile metadata;
  removing a setup deletes only its local configuration. Without persistent
  storage permission, reopening that profile becomes read-only.
- `src/storage/local-storage.ts` owns the browser-to-worker session boundary;
  `sqlite.worker.ts` initializes SQLite WASM and uses the OPFS VFS. Do not
  substitute localStorage or an in-memory database.
- Persistent browser storage is optional and is requested only after the user
  initiates profile creation or restore. Read-only capability checks and profile
  discovery do not prompt. A denied or unavailable persistence request warns
  without blocking local use.
- `src/main.tsx` selects diagnostics and Markdown legal pages;
  `src/App.tsx` handles the landing page and profile-scoped claims route without
  a routing library.
- Global styles and theme-level CSS are in `src/index.css`; UI controls and
  layout primarily use Mantine. `public/icons.svg` is referenced by root URL.
- `AppHeader` links the logo/title to the landing page and opens `SettingsDialog`
  on every page. Mantine persists Light/Dark/System theme selection locally;
  System follows the operating system's preference.
- `DisplaySettingsProvider` stores Advanced display in browser-local
  `localStorage`, never in a profile or synced data. It defaults on in Vite
  development and loopback production previews, off on other production hosts.
  `AdvancedDetails` and `RecordTechnicalDetails` gate diagnostic links/content,
  internal IDs, record timestamps, and environment-available developer tools.
  Read-only notices, errors, persistence/data-loss warnings, user-entered
  dates, and essential record actions remain visible. Blocked storage still
  permits changes for the current visit.
- `@tabler/icons-react` supplies decorative action and activity-kind icons.
  `public/jst-logo.svg` is the diagonal JST SVG brand mark used as the favicon;
  matching `pwa-192.svg` and `pwa-512.svg` assets supply install icons.
- `DisclaimerFooter` renders Markdown imported from `src/content/disclaimer.md`.
  It stays fixed to the viewport bottom on desktop and appears at both ends of
  the page on mobile. Replace the copy in that text file.
- `DisclaimerDialog` requires explicit acknowledgment of that same Markdown on
  first use. A browser-local `localStorage` entry records the loaded build and
  disclaimer text, separately from profiles and simulated sync. New builds,
  changed disclaimer text, or cleared/expired storage prompt again; blocked
  storage allows continuation but cannot remember acknowledgment across visits.
- `/eula` and `/privacy` render `src/content/eula.md` and
  `src/content/privacy-policy.md` as Markdown; footer links provide access to
  both documents. Keep the legal copy reviewed and replace any remaining
  placeholders before relying on or publishing it.

## Tests and common commands

- `npm test` runs Vitest service and component tests colocated with source.
- `npm run test:browser` builds the app and runs Playwright against development
  and production-preview servers. Browser tests live in `tests/browser/`.
- `npm run build` type-checks the app and build-tool projects, then creates
  `dist/`.
- `npm run lint` runs Oxlint. Use `npm ci` to install the locked dependencies.

Playwright uses Chromium and Firefox on Windows; WebKit is excluded there
because the SQLite OPFS proxy worker does not start reliably on this host.
See the README for browser setup and platform-specific validation details.

Activity coverage lives in `src/storage/activities.test.ts` and
`tests/browser/activity-lifecycle.spec.ts`; schema/migration and claim-cascade
regressions remain in `activity-schema.spec.ts` and `claim-lifecycle.spec.ts`.
Week derivation tests are in `src/storage/activity-weeks.test.ts`; weekly
navigation, gaps, boundaries, and date-edit behavior are covered by
`tests/browser/weekly-activities.spec.ts` in Chromium/Firefox development and
production-preview projects.
Responsive collapse defaults, summaries, keyboard controls, resize focus, and
pending form preservation are also covered in `weekly-activities.spec.ts`.
Evidence policy/service tests are in `src/storage/evidence-model.test.ts` and
`evidence.test.ts`; browser UI/download/cancellation/retry coverage lives in
`tests/browser/activity-evidence.spec.ts`. Real SQLite migration, ownership,
and cascading cleanup are covered by `tests/browser/evidence-storage.spec.ts`.
Profile export/restore and real SQLite snapshot checks are in
`tests/browser/profile-export.spec.ts` and `src/storage/sqlite-import.test.ts`.

## Manual claims testing

With `npm run dev`, or `npm run build` followed by `npm run preview` on
`localhost`, `127.0.0.1`, or `[::1]`, open a profile to find **Developer claim tools**.
These controls also require **Advanced display** in Settings (on by default
in these environments).
**Add dummy claims** inserts a repeatable set of four real,
profile-scoped SQLite records (duplicates, optional dates, and a long label).
They survive reload and can also be deleted individually through the normal UI.
Three dummy claims each include five activities covering employer contacts,
WorkSource, and other activities, with a year-boundary week and two empty gap
weeks. The long-name claim starts empty. Activity fixtures use reserved
`dededede-0000-4000-8000-*` UUIDs; adding again restores missing fixtures without
duplicating or overwriting existing fixture edits. Successful fixture changes
refresh the selected claim's activity view immediately.
**Remove dummy claims** deletes only the four reserved `developer-dummy-claim-*`
record IDs owned by these tools and all their activities, without confirmation;
this includes activities manually added to dummy claims. Other claims and their
activities are retained.
Both operations are transactional, and failures leave existing records unchanged.

These controls respect read-only access. If disabled, return to profiles, use
**Set up simulated sync** for that profile, and connect the simulated provider,
then reopen the profile. This is only a local write-access simulation, not backup.
The controls and fixture module are bundled for local preview, but disabled on
non-loopback production hosts. This hostname check is a convenience gate, not
authentication; the existing profile write-access checks still apply.
