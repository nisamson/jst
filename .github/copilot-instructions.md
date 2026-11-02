# Repository instructions

## Commands

Use npm and keep `package-lock.json` synchronized with `package.json`.

| Task | Command |
| --- | --- |
| Install locked dependencies | `npm ci` |
| Start Vite with HMR | `npm run dev` |
| Type-check both TS projects and build to `dist` | `npm run build` |
| Lint the project | `npm run lint` |
| Apply safe lint autofixes | `npm run lint:fix` |
| Lint one file | `npm exec -- oxlint --deny-warnings src/App.tsx` |
| Serve the production build locally | `npm run preview` |

## Architecture

- This is a client-rendered React application. `index.html` loads
  `src\main.tsx`, which mounts `App` into `#root` inside `StrictMode`.
  `src\App.tsx` owns the current page and its local state.
- `vite.config.ts` uses `@vitejs/plugin-react` for React transformation and Fast
  Refresh. React Compiler is not enabled.
- The root TypeScript configuration references two no-emit projects:
  `tsconfig.app.json` covers browser code in `src`; `tsconfig.node.json` covers
  `vite.config.ts` with Node types. Keep browser and build-tool settings separate.
- Global styles and light/dark theme tokens live in `src\index.css`;
  `src\App.css` styles the page using those tokens. Both use native CSS nesting.
  Assets imported from `src\assets` are processed by Vite; files in `public`
  are referenced with root-relative URLs, including SVG symbol fragments.

## Conventions

- Use the automatic JSX runtime (`react-jsx`); JSX alone does not require a
  `React` import. Source uses single quotes, no semicolons, and two-space
  indentation.
- TypeScript uses `verbatimModuleSyntax` and `erasableSyntaxOnly`: use type-only
  imports for types and avoid syntax requiring TypeScript runtime emission,
  such as enums and constructor parameter properties.
- Oxlint configuration is centralized in `.oxlintrc.json`, not ESLint. It enables
  correctness and suspicious categories for TypeScript, Unicorn, Oxc, React,
  and JSX accessibility, with explicit Hooks and Fast Refresh rules. The lint
  command fails on warnings; TypeScript checking remains part of the build.
- Component modules must follow `react/only-export-components`. Vite-safe
  primitive constant exports are allowed; put other non-component utilities in
  separate modules.
- Reuse the global CSS custom properties for colors and theme-dependent styling;
  dark mode is controlled by `prefers-color-scheme`.
