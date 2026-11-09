# Project structure

This guide describes the checked-in application structure and points to the
right files for common changes. It is a navigation map, not a second
architecture specification; see [architecture](architecture.md) and the
[onboarding story](user-stories/onboarding.md) for product and data decisions.

## Application flow

`index.html` loads `src/main.tsx`. The entry point mounts React in `StrictMode`,
configures Mantine, and selects `/diagnostics/storage` by pathname; other paths
render `src/App.tsx`. `App` handles profile selection and `/claims?profile=<id>`
navigation inside the `StorageStatus` capability boundary.

| Area | Location | Responsibility |
| --- | --- | --- |
| App shell | `src/App.tsx`, `src/main.tsx` | Root component, Mantine setup, page selection and lightweight history navigation |
| Pages | `src/pages/` | `ProfileLandingPage` discovers and creates profiles; `ClaimsPage` opens a selected profile and shows its claims overview; `StorageDiagnosticsPage` hosts storage diagnostics |
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
  `ClaimOverview` details, empty/stale states, and confirmed deletion.
- `src/storage/profiles.ts` owns profile create/list/open operations. Each
  profile has a stable ID and a separate SQLite database in OPFS.
- `src/storage/simulated-sync-state.ts` persists successful simulated setup
  inside that profile database; `src/sync/simulated-provider.ts` is a
  display-only dummy provider and never transfers profile data.
- `src/storage/local-storage.ts` owns the browser-to-worker session boundary;
  `sqlite.worker.ts` initializes SQLite WASM and uses the OPFS VFS. Do not
  substitute localStorage or an in-memory database.
- Persistent browser storage is optional and is requested only after the user
  initiates profile creation. Read-only capability checks and profile
  discovery do not prompt. A denied or unavailable persistence request warns
  without blocking local use.
- `src/main.tsx` selects the storage diagnostics page; `src/App.tsx` handles
  the landing page and profile-scoped claims route without a routing library.
- Global styles and theme-level CSS are in `src/index.css`; UI controls and
  layout primarily use Mantine. `public/icons.svg` is referenced by root URL.

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

## Manual claims testing

With `npm run dev`, or `npm run build` followed by `npm run preview` on
`localhost`, `127.0.0.1`, or `[::1]`, open a profile to find **Developer claim tools**.
**Add dummy claims** inserts a repeatable set of four real,
profile-scoped SQLite records (duplicates, optional dates, and a long label).
They survive reload and can also be deleted individually through the normal UI.
**Remove dummy claims** deletes only the four reserved `developer-dummy-claim-*`
record IDs owned by these tools, without confirmation; other claims are retained.
Both operations are transactional, and failures leave existing records unchanged.

These controls respect read-only access. If disabled, return to profiles, use
**Set up simulated sync** for that profile, and connect the simulated provider,
then reopen the profile. This is only a local write-access simulation, not backup.
The controls and fixture module are bundled for local preview, but disabled on
non-loopback production hosts. This hostname check is a convenience gate, not
authentication; the existing profile write-access checks still apply.
