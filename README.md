# jst

React + TypeScript application built with Vite and `@vitejs/plugin-react`.

## Commands

```sh
npm ci
npm run dev
npm run build
npm run preview
```

`build` runs TypeScript project checks before producing the production bundle in
`dist`. `preview` serves that bundle locally.

## Local storage foundation

SQLite runs in a dedicated module worker using the official
`@sqlite.org/sqlite-wasm` package and its `opfs` VFS. The app checks support
and requests persistent browser storage, warning when that permission is
pending, denied, or unavailable. Optional permission requests never block
database reads/writes. Local records are not a guaranteed backup.
The app supports local profile discovery, selection, and creation. Profile
initialization is explicit: storage setup alone creates no profile database.

Use HTTPS or localhost. Both Vite development and preview send the required
headers below. Production hosting must also send them:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Serve the complete `dist` output, including the worker, OPFS proxy, and WASM
assets; `.wasm` must use `application/wasm`. Cross-origin isolation can restrict
third-party assets and popup relationships; consider it when adding real
cloud authorization. Unsupported or failed SQLite/OPFS setup blocks storage
use rather than falling back to memory or localStorage.

The production build is installable as a PWA and precaches the app shell,
including SQLite's WebAssembly and worker assets. After the first online load,
the app can reopen and navigate offline. New app versions are staged until the
user chooses to reload. The service worker caches no profile databases:
offline app assets do not provide persistence, sync, or backup, and browser
storage may still be cleared. Production hosting must serve the complete
`dist` directory over HTTPS (localhost is suitable for development) and keep
the isolation headers above; verify these headers and `.wasm` content type on
the deployed origin.

The storage service in `src/storage/local-storage.ts` initializes a session
without opening a database. `openDatabase('/id.sqlite3')` opens an existing
file; `{ create: true }` explicitly allows creation. Use bound values with
`execute(sql, bindings)`, close the current database before opening another,
and await `dispose()` when finished. Do not retry failed writes automatically:
a lost worker response cannot prove whether a write committed.
See [the architecture](docs/architecture.md) for platform limitations and
the storage model. See [the project structure](docs/project-structure.md) for
a quick code map.

## Tests

```sh
npm test
npm exec -- playwright install chromium firefox
npm run test:browser
```

On supported Linux/macOS hosts, also install WebKit with
`npm exec -- playwright install webkit`; Linux may require
`npm exec -- playwright install --with-deps chromium firefox webkit`.
Use an OS supported by the installed Playwright release.

Vitest runs focused capability, permission, worker-client lifecycle, and
diagnostic error tests. Playwright builds the app and starts its own
development and production-preview servers on ports 4176 and 4177.
Projects are named `<browser>-development` and `<browser>-production`.
Chromium and Firefox run on Windows; Linux/macOS also enable WebKit.
Windows WebKit was probed but timed out starting SQLite's nested OPFS proxy
in both development and production, so its projects are explicitly excluded
on Windows rather than counted as passing. This is not a claim about Safari.
Linux/macOS WebKit and physical mobile devices have not been verified here.

The browser tests verify real SQLite/OPFS writes, reads, database reopen,
worker replacement, reload, failed operations, and support reporting.
Diagnostics-page tests exercise persistence through the production bundle
as well. Browser contexts are isolated from normal browser data.

```sh
npm run test:browser -- --project=firefox-development
npm run test:browser -- --headed
npm run test:browser -- --ui
npm run test:browser -- --debug
```

`--headed` shows browser windows; `--ui` opens the visual test runner with
reruns and traces; `--debug` opens the step-through Inspector. These commands
build first so production-preview checks do not use stale assets.

### Manual database read/write check

Run `npm run dev`, then follow **Storage diagnostics**, or open
`http://localhost:5173/diagnostics/storage` in the browser you want to test.

1. Select **Write and reopen test record**. This creates a real SQLite table,
   writes a synthetic token/timestamp using bound values, closes the database,
   and reopens it to verify the token.
2. Select **Reload page**, then **Read saved test record**. A matching token
   and unchanged timestamp verify that the database survived reload.
3. Select **Clear diagnostic test data** to remove only that synthetic row
   and its URL marker. The empty test database remains; profile data is never
   accessed or cleared.

The expected token is retained in the URL, not localStorage or an in-memory
copy of the database. Tests use only the reserved
`/jst-storage-diagnostics.sqlite3` file. Another diagnostics tab can replace
its single test record; a mismatching token is reported as a failure.
Unsupported storage hides the probe actions; write/read failures remain
visible and retryable, never shown as a successful persistence check.

For actual Safari/iOS or another device, use an HTTPS deployment with the
isolation headers and an SPA fallback to `index.html` for this path.
Plain HTTP to a development machine's LAN address is not a secure context;
do not bypass this by disabling browser security. Keep the same origin,
browser, and URL when checking persistence. Playwright WebKit/device
emulation does not replace real Safari or physical-device checks.

## Linting

```sh
npm run lint
npm run lint:fix
npm exec -- oxlint --deny-warnings src/App.tsx
```

Oxlint is configured in `.oxlintrc.json`. Correctness and suspicious rules are
enabled as errors for the built-in TypeScript, Unicorn, Oxc, React, and JSX
accessibility plugins. React rules include Hooks usage, effect dependencies, and
Fast Refresh export checks. Primitive constant exports are allowed alongside
components, matching Vite's Fast Refresh support.

The automatic JSX runtime does not require importing `React`, so
`react/react-in-jsx-scope` is disabled. `npm run lint` fails on warnings as well
as errors. `lint:fix` applies ordinary autofixes, not dangerous fixes.

Oxlint handles linting; `npm run build` remains the TypeScript checking step.
For editor diagnostics, use an Oxlint integration that reads `.oxlintrc.json`.

## React Compiler

The React Compiler is not enabled. See the
[Vite React Compiler documentation](https://vite.dev/guide/features.html#react-compiler)
for configuration.
