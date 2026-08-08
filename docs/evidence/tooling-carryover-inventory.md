# Tooling Carryover Inventory

## Decision boundary

This blank-slate branch retains development policy, not Setta application or runtime machinery. The source snapshot is `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; Git history remains the archive for anything intentionally left behind.

`scripts/check-boundaries.mjs` enforces the reviewable tree shape and import boundary described here. It checks tracked and untracked, non-ignored files so a newly introduced violation fails before it is committed.

## Retained policy and blank-branch owner

| Retained policy or threshold                                                                                                                        | Blank-branch owner                                                 | Executable gate                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Exact Node `24.18.1`, Corepack `0.35.0`, and pnpm `11.19.0`                                                                                         | `.node-version`, root manifest, lockfile                           | `scripts/check-dependencies.mjs`                                                       |
| Exact external dependency pins and private manifests                                                                                                | All four manifests                                                 | `scripts/check-dependencies.mjs`                                                       |
| Seven-day release quarantine, strict missing-time handling, loaded-lockfile verification, no trust downgrade, and exotic-transitive-source blocking | Both pnpm workspace policies                                       | `scripts/check-dependencies.mjs`, `scripts/audit-supply-chain.mjs`                     |
| Narrow, owned, expiring supply-chain exceptions                                                                                                     | `supply-chain-exceptions.json`                                     | `scripts/check-dependencies.mjs`                                                       |
| Denied dependency lifecycle scripts; no package is currently allowlisted, and any future exception requires exact reviewed metadata                 | empty `allowBuilds` in both pnpm workspace policies                | frozen install and `scripts/check-dependencies.mjs`                                    |
| Minimal line endings, ignores, and editor consistency                                                                                               | `.gitattributes`, `.gitignore`, `.editorconfig`                    | changed-file formatting and repository review                                          |
| Prettier formatting and deterministic import organization                                                                                           | `.prettierrc.json`, `.prettierignore`                              | `corepack pnpm quality`                                                                |
| TypeScript and React linting; cyclomatic complexity fails at 10 or greater                                                                          | `eslint.config.js` (`complexity: 9`)                               | `corepack pnpm quality`                                                                |
| Strict TypeScript, unused-symbol, exact-optional, and unchecked-index protection                                                                    | `tsconfig.base.json` and workspace configs                         | `corepack pnpm typecheck`                                                              |
| Dead files, exports, and dependencies                                                                                                               | `knip.json`                                                        | `corepack pnpm knip`                                                                   |
| Production TypeScript below 1,000 lines and tests below 1,200 lines                                                                                 | `scripts/check-file-lengths.mjs`                                   | `corepack pnpm quality`                                                                |
| Non-failing complexity and file-length hotspot reports                                                                                              | `scripts/report-complexity.mjs`, `scripts/report-file-lengths.mjs` | explicit report commands                                                               |
| Focused, non-gating performance measurements with append-only evidence                                                                              | `scripts/measure-geometry-index.mjs`, `perf/`                      | `corepack pnpm perf:geometry`                                                          |
| Backend-free unit, browser, accessibility, keyboard, focus, and representative visual tests                                                         | Vitest and Playwright configs, `tests/e2e`                         | `corepack pnpm test:unit`, `corepack pnpm test:e2e`                                    |
| Declarations, declared subpaths, CSS, tarball allowlist, local pack, and unrelated consumer build                                                   | package exports and package/consumer scripts                       | `corepack pnpm pack:check`, `corepack pnpm consumer:check`, `corepack pnpm api:report` |
| Dependency license inventory, vulnerability policy, and machine-readable lockfile inventory                                                         | license policy and supply-chain scripts                            | `corepack pnpm supply-chain:check`                                                     |
| Package-only tree and imports with no application aliases or undeclared source subpaths                                                             | this inventory and `scripts/check-boundaries.mjs`                  | `corepack pnpm check:boundaries`                                                       |
| Repository-owned plan-loop automation                                                                                                               | `scripts/automation/codex-loop`                                    | `corepack pnpm test:automation`                                                        |

The fast quality command selects changed files by default and supports `--staged`, `--files`, and `--all`. Deterministic checks stay in that path. Registry-backed age/trust verification and vulnerability auditing remain in the separate supply-chain command so a network outage cannot present as a source-quality failure.

## Intentionally rejected carryover

The branch does not retain or recreate these application-specific surfaces:

- Go or Python source, toolchains, generators, test harnesses, servers, CLIs, or quality orchestration.
- The Setta frontend or backend trees, application state, generated API contracts, OpenAPI tooling, authentication, WebSockets, or runtime bootstraps.
- Plugin authoring, plugin fixtures, installer, deployment, sharing, registry publication, release automation, or public-license decisions.
- Activation scripts, desktop launchers, worktree helpers, Git hooks, application GitHub workflows, cleanup loops, or application-specific ignore rules.
- Compatibility helpers, migrations, legacy aliases, dual paths, or adapters for current Setta project files.
- The historical XYFlow or dnd-kit forks as source dependencies. Their behavior remains evidence only until the Phase 0 adapter and interaction-owner proofs select exact upstream dependencies and package-owned algorithms.

The boundary checker allows only the workspace package, Node-only playground, unrelated consumer
fixture, documentation, append-only performance evidence, tests, and reviewed project-owned
tooling. Expanding that tree requires updating this inventory and the executable allowlist in the
same implementation change.
