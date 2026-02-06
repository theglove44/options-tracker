# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React application. Entry is `src/main.jsx`, and the main UI/logic lives in `src/App.jsx`.
- Reusable UI and feature modules go in `src/components/` (for example, `src/components/AIInsights`).
- Styling is split across `src/index.css`, `src/App.css`, and `src/tailwind.css`, with Tailwind configured in `tailwind.config.js` and `postcss.config.js`.
- Static assets live in `public/`, while build output goes to `dist/` (generated; do not edit).
- `tasty.csv` is a sample dataset for local testing and demos.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server with hot module reload.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint across the codebase.

## Coding Style & Naming Conventions
- Codebase is modern JS/JSX (ES modules) using React 19 and Vite.
- Use 2-space indentation and follow the style already used in a file (some files include semicolons, some do not).
- Component names are PascalCase; hooks use the `useX` convention.
- Keep lint clean per `eslint.config.js` and avoid unused variables (exceptions only for intentionally unused uppercase constants).

## Testing Guidelines
- No automated test runner is configured yet. If you add tests, colocate them (for example, `src/components/__tests__/`) and add a `test` script in `package.json`.
- Use descriptive test names and keep sample data in `src/assets/` or a dedicated `test-data/` directory.

## Commit & Pull Request Guidelines
- Git history is not available in this checkout; use concise, scoped commit messages such as `feat: add symbol filter` or `fix: handle empty CSV rows`.
- PRs should include a short summary, commands run (if any), and screenshots or GIFs for UI changes.
- Link related issues or tickets when applicable.
