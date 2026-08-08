# Repository Guidelines

## Scope and ownership

- This branch contains the standalone `@setta/workspace` TypeScript/React library, its backend-free playground, an unrelated consumer fixture, documentation, and project-owned development tooling.
- `packages/workspace/src/core.ts` owns the serializable document and framework-neutral behavior. `packages/workspace/src/react.tsx` owns React rendering and interaction surfaces. Keep upstream XYFlow and dnd-kit contracts behind internal adapters when those dependencies are introduced.
- Public consumers may import only declared package exports. Never require source aliases, internal paths, application state, generated Setta contracts, Go, Python, HTTP, or a Setta runtime.
- Do not add compatibility shims, migrations, legacy aliases, transitional adapters, dual paths, or old Setta project support unless explicitly requested.

## Dependencies and supply chain

- Pin checked-in external dependencies exactly. Workspace protocol references are allowed for local packages.
- Use the exact Node and pnpm versions declared by the repository.
- Keep `minimumReleaseAge`, strict publication-time checks, loaded-lockfile verification, trust-downgrade checks, exotic-transitive-source blocking, and dependency build-script controls enabled.
- Any dependency-policy exception must identify one exact package and version or immutable source, a rationale, an owner, and an expiry.
- Keep manifests private. Registry publishing, repository migration, release automation, and public licensing decisions are outside this branch's current scope.

## Code shape

- Prefer small, pure, deterministic behavior helpers with focused tests.
- Fail specifically instead of silently falling back or guessing.
- Keep production TypeScript files below 1,000 lines and test files below 1,200 lines. Cyclomatic complexity fails at 10 or greater.
- Do not add `try/catch` unless it handles a specific failure path.
- Design for large DOMs: narrow subscriptions, transient gesture state, bounded geometry work, and no whole-workbench rerenders during pointer movement.

## Accessibility and UI verification

- Use native elements first, preserve visible `:focus-visible` outlines, and provide keyboard equivalents for every pointer action.
- Verify accessible names, roles, states, focus movement and restoration, live announcements, 200% zoom, 320 CSS-pixel reflow, coarse pointers, and reduced motion. Automated accessibility scans supplement rather than replace interaction checks.
- UI changes require browser visual verification. Record the result in the final response as `CDP visual check: done (...)` or `CDP visual check: not run (reason)`.

## Commands

- Install: `corepack pnpm install --frozen-lockfile`
- Fast changed-file quality checks: `corepack pnpm quality`
- Full deterministic verification: `corepack pnpm quality:all`
- Unit tests: `corepack pnpm test:unit`
- Plan-loop automation tests: `corepack pnpm test:automation`
- Browser tests: `corepack pnpm test:e2e`
- Packed consumer boundary: `corepack pnpm consumer:check`
- Network-backed supply-chain audit: `corepack pnpm supply-chain:check`

Use temporary directories for consumer and packaging tests. Do not mutate another worktree, real application data, or Git history in tests.
