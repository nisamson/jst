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
