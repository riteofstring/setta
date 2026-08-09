# Repository Guidelines — workspace extraction branch

This branch extracts Setta's workspace UI into a standalone TypeScript/React package. The single
active plan is `docs/plans/setta-workspace-extraction-plan.md`; read it before making changes. The
Setta application, its Go/Python backends, and its application tooling were removed from this branch
by the hygiene preflight. Git history and `../setta-main` preserve them; do not restore application
code here.

## Worktrees and sources of truth

- `../setta-main` is the frozen product reference: `main` at `043d3b2e9`. Run and inspect it only.
  Never edit, pull, switch branches, install packages into, or commit from it. A changed reference
  requires an explicit developer re-baseline.
- This worktree (`workspace-extraction`) holds the package, playground, tooling, and evidence.
- `../setta-workspace-integration` is a temporary integration host created only when Phase 2 needs
  it, from the recorded reference commit.
- `workspace-blank-slate` is a donor branch of individually proven algorithms, tests, and tooling.
  Never merge the branch wholesale or import unrelated application code.

## Product authority and parity

- The running `../setta-main` application outranks prose, plans, and any agent's interpretation of
  "Setta-like."
- Extract before refactoring; parity before genericity. Do not redesign controls, rename concepts,
  modernize spacing, or substitute a generic design system during extraction.
- No agent or test suite may approve visual quality. Every visual or interaction milestone requires
  explicit developer acceptance of live side-by-side evidence.
- Sections drag from any non-interactive part of their surface; visible controls stay as compact as
  main while hit geometry stays large; selection never changes geometry. The plan's parity rules
  are the full contract.

## Code ownership and layout

- The package is authored in TypeScript/TSX under the working name `@setta/workspace` in
  `packages/workspace/`; the backend-free consumer lives in `apps/playground/`; package-focused
  tooling lives in `scripts/`; accepted evidence lives in `docs/evidence/`.
- Ship compiled ESM, TypeScript declarations, source maps, and one compiled, scoped stylesheet.
  Consumers must not need Tailwind, the package's build setup, or Setta configuration.
- React and React DOM are host-provided peer dependencies with documented compatible ranges. All
  other checked-in direct dependencies are exact-pinned; no floating ranges (`^`, `~`, `>=`, `*`,
  `latest`) outside `peerDependencies`.
- Do not expose Setta application stores, generated backend clients, backend concepts, XYFlow
  internals, dnd-kit stores, Tailwind class names, or private selectors as public API.

## Absolute prohibitions

- No backward-compatibility code of any kind: no migrations, aliases, dual paths, shims,
  transitional styles, legacy APIs, or unreachable states — in code or in plans.
- No publishing, public repository creation, licensing, or final-naming decisions by
  implementation.
- No heuristic fallbacks or broad catch-all handling; fail loudly and specifically. Do not add
  `try/catch` unless it handles a specific failure path.

## Verification

- `pnpm run quality` (changed files by default; `--staged`, `--all`, `--files <path>...`) is the
  static gate for every reviewable source batch. `pnpm run supply-chain:check` runs on dependency
  changes and phase gates only. `pnpm run consumer:check` (the packed unrelated-consumer proof
  against `fixtures/packed-consumer`) runs at phase gates and on packaging changes. Thresholds, policy files, and exception rules are documented in
  `docs/quality-and-supply-chain-tooling.md`; do not weaken a control to make a change pass.
- Use the standalone pnpm from `~/Library/pnpm` (corepack is broken on this machine); the pinned
  toolchain is pnpm 10.23.0 on Node 25.2.1.
- Visual batches follow the plan's verification order: reproduce the main reference, implement the
  smallest change, run focused checks, compare main and package live through Chrome DevTools at the
  same viewport, appearance, zoom, and state, present side-by-side evidence, and refresh visual
  baselines only after developer acceptance. Baselines are regression locks, never approval.
- `scripts/chrome-devtools-mcp.sh` provides the worktree-scoped Chrome DevTools MCP server used by
  `.codex/config.toml`; `scripts/automation/codex-loop/` holds the plan-implementation loop runner.
- Stop and return to the developer at every plan stop condition instead of expanding scope.
