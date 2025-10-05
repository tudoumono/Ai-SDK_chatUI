# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds App Router routes, layouts, and API handlers; keep feature assets within the same segment.
- `components/` stores shared UI pieces; colocate companion hooks or styles in subfolders to keep imports shallow.
- `data/` contains static fixtures and schema definitions powering chat behaviour—update these before inlining constants.
- Root configs (`package.json`, `next.config.mjs`, `tsconfig.json`) define scripts, build settings, and the `@/*` alias; see `設計.md` for product context.

## Build, Test, and Development Commands
- `npm install` — install dependencies whenever the lockfile changes.
- `npm run dev` — start the Next.js dev server for local work.
- `npm run lint` — run the shared ESLint/Next rules; resolve all findings before committing.
- `npm run build` then `npm run start` — create and serve the production bundle for release smoke tests.

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled; type component props, async responses, and configuration objects.
- Default to functional React components, `camelCase` variables, and `PascalCase` component file names.
- Keep 2-space indentation and rely on the formatting emitted by Next.js/Prettier.
- Import through `@/*` rather than deep relative paths; propose additional aliases via pull request discussion.

## Testing Guidelines
- No automated harness exists yet; combine `npm run lint` with manual smoke tests while `npm run dev` is running.
- Note manual test steps and expected outputs in each pull request until automated coverage is added.
- If you introduce tests, colocate them with the feature and expose a runnable script in `package.json`.

## Commit & Pull Request Guidelines
- Use short imperative commit subjects; conventional prefixes (`feat:`, `fix:`, `chore:`) or concise Japanese summaries match history.
- PRs must explain the purpose, link issues/tasks, attach UI screenshots or GIFs when visuals change, and include `npm run lint` / `npm run build` results.
- Scope changes to `Ai-SDK_chatUI/`; negotiate cross-folder edits before submitting.

## Security & Configuration Tips
- Keep API keys and chat transcripts out of git; the UI follows a BYOK model described in `設計.md`.
- Store local overrides in `.env` (ignored) and note required variables in the PR description.
- Verify IndexedDB storage and JSON export/import still respect the BYOK contract.

## Agent-Specific Instructions
- Treat this directory as self-contained: read elsewhere if needed but modify files only here.
- Update this guide whenever workflow, tooling, or commands materially change.
