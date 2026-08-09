# Quality and supply-chain tooling

This document is the operating reference for the tooling contract established by preflight items
6–8 of `docs/plans/setta-workspace-extraction-plan.md`. The package uses Node/pnpm for formatting,
linting, dependency review, and supply-chain checks. Normal checks require only the pinned
toolchain below.

## Toolchain pins

- Node `25.2.1` (`.node-version`, `engines.node`).
- pnpm `10.23.0` standalone from `~/Library/pnpm` (`packageManager`). Corepack is broken on this
  machine and must not be used; every script invokes plain `pnpm`.
- All package-manager configuration flows through `pnpm-workspace.yaml`. Tracked `.npmrc`,
  `.yarnrc*`, `package-lock.json`, and `yarn.lock` files are rejected by the dependency check.

## Commands

| Command                        | Scope and cost                              | When to run                        |
| ------------------------------ | ------------------------------------------- | ---------------------------------- |
| `pnpm run quality`             | Static, deterministic, offline              | Every reviewable source batch      |
| `pnpm run quality:all`         | Same checks over all project files          | Stable-tree sweeps, phase gates    |
| `pnpm run format`              | Prettier write mode                         | Before committing                  |
| `pnpm run supply-chain:check`  | Networked: install, registry audit, license | Dependency changes and phase gates |
| `pnpm run report:complexity`   | Non-blocking hotspot report                 | Discovery; never a deletion order  |
| `pnpm run report:file-lengths` | Non-blocking hotspot report                 | Discovery; never a deletion order  |

`quality` selection modes: default is tracked changes against `HEAD` plus untracked files;
`--staged` checks the index; `--all` checks every project file; `--files <path>...` checks an
explicit list.

The changed-file gate runs, in order: dependency/boundary policy (`scripts/check-dependencies.mjs`),
Prettier check, `bash -n` shell syntax, ESLint (type-aware TypeScript baseline with React Hooks and
JSX accessibility), file-length ceilings, `tsc --noEmit` for each workspace `tsconfig.json`, and
Knip dead-code analysis. Tests, builds, packing, browser checks, and networked audits are separate
commands invoked by their phase gates — never part of the routine quality command.

## Enforced thresholds

| Threshold                          | Value | Source                                               |
| ---------------------------------- | ----- | ---------------------------------------------------- |
| Cyclomatic complexity (source)     | 9     | `eslint.config.js`, source configuration |
| Cyclomatic complexity (test files) | 9     | Separate config block; may diverge from source       |
| `max-depth` (source only)          | 4     | `eslint.config.js`, source block                       |
| `max-params` (source only)         | 5     | `eslint.config.js`, source block                       |
| File length (source)               | 1,300 | Ratified 2026-08-10, see below                       |
| File length (test files)           | 1,500 | Ratified 2026-08-10, see below                       |

Test files are `*.test.*`, `*.spec.*`, and files under `tests/` or `__tests__/`.

File-length ratification: the ceilings were measured against the frozen reference, not inherited.
The largest in-scope fork modules in `../setta-main` are `forks/dnd-kit/useDropType.ts` (1,222
lines) and `forks/xyflow/core/container/ZoomPane.tsx` (1,181 lines). Because the plan requires
extracting proven fork behavior before refactoring it, the source ceiling must admit those files
unmodified; 1,300 provides that with minimal slack. The test ceiling of 1,500 allows characterization tests that enumerate captured reference states. Raising either
ceiling requires re-ratification here with new evidence.

## Supply-chain policy

`supply-chain-policy.json` is the single checked-in release-age policy source (currently 7 days).
`scripts/check-dependencies.mjs` mechanically verifies that `pnpm-workspace.yaml` matches it
(`minimumReleaseAge: 10080` minutes) and that every strict control is present: `saveExact`,
`strictPeerDependencies`, `minimumReleaseAgeStrict`, `minimumReleaseAgeIgnoreMissingTime: false`,
`trustPolicy: no-downgrade`, `trustLockfile: false`, `blockExoticSubdeps: true`, and an explicit
empty `onlyBuiltDependencies` allowlist.

Manifest policy: `dependencies`, `devDependencies`, and `optionalDependencies` must use exact
versions or `workspace:` specifiers. `peerDependencies` may use documented compatible ranges (a
reusable React package needs supported peer ranges), but never `*` or `latest`. Every manifest is
`private: true` with no `publishConfig` while publishing remains undecided.

`pnpm run supply-chain:check` runs: dependency policy → clean frozen install → lockfile/manifest
synchronization in an isolated temporary directory with lifecycle scripts disabled (never rewriting
the working tree) → an independent audit of every registry package/version in the transitive
lockfile against registry publication timestamps (fails closed on unsupported lockfile entries and
missing metadata) → `pnpm audit --audit-level moderate` → SPDX license allowlist
(`dependency-license-policy.json`) → dependency inventory (`.reports/`).

### Exceptions

There are none, and `supply-chain-exceptions.json` starts empty. Any future exception must name the
exact package/version or vulnerability and carry rationale, owner, expiry, and removal condition,
and receive developer approval. The dependency check fails on any `pnpm-workspace.yaml` exclusion,
build allowance, patch, or override that lacks matching unexpired metadata — and on any metadata
without a matching configuration entry. Raw pnpm ignore configuration (`trustPolicyExclude`,
`dangerouslyAllowAllBuilds`, `auditConfig`, `overrides`) is rejected outright.

## Blocking demonstrations (preflight item 8, 2026-08-10)

Run against a clean frozen install (278 locked versions; gate green end to end), then each failure
class was induced in a scratch copy and confirmed blocking (exit 1):

1. Install-time release age: pinning `knip@6.32.1` (published the same day) fails resolution with
   `ERR_PNPM_NO_MATCHING_VERSION`.
2. Independent release-age audit: an inflated policy age fails the lockfile audit.
3. Lockfile drift: a manifest edit without a lockfile update fails the isolated sync check with
   `ERR_PNPM_OUTDATED_LOCKFILE`.
4. Disallowed build: an `onlyBuiltDependencies` entry without exception metadata fails.
5. Unowned exception: a `minimumReleaseAgeExclude` entry without metadata fails; an entry whose
   metadata has expired also fails.
6. Vulnerability: `lodash@4.17.15` in the lockfile fails `pnpm audit` at `moderate`.
7. License: removing MIT from the allowlist fails the gate at the license step.

No control was weakened to make the initial dependency graph pass.
