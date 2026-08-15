# Quality and supply-chain tooling

Code Policy is the shared enforcement owner for this branch. The exact policy checkout is pinned
at `.code-policy`, project facts live in `.code-policy.json`, and `check_policy.sh` is the only
target entry point. The package remains a Node/pnpm project; Code Policy's Go runtime and scanners
stay inside `.code-policy/.tools` and do not become package dependencies.

## Commands

| Command                                      | Purpose                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `./check_policy.sh check`                    | Changed-file formatting, lint, type, complexity, dead-code, architecture, shell, and file-length checks |
| `./check_policy.sh check --all`              | The same static policy over every governed file                                                         |
| `./check_policy.sh format`                   | Shared formatter write mode for selected files                                                          |
| `./check_policy.sh test --changed`           | Focused tests for changed modules and reverse dependents                                                |
| `./check_policy.sh test-levels --base <ref>` | Read-only recommended/full/supplemental execution plan                                                  |
| `./check_policy.sh supply-chain --offline`   | Exact dependency, lifecycle, lock-sync, workflow, and local-path policy                                 |
| `./check_policy.sh gate`                     | Authorized complete ordinary gate, including online security, builds, and full tests                    |

The pinned policy owns changed/staged/all/explicit selection, final newlines, trailing whitespace,
file-length ceilings, TypeScript production/test complexity budgets, depth and parameter limits,
Prettier execution, ESLint execution, TypeScript checking, Knip dead-code analysis, exact direct
versions, peer/dev compatibility, package-manager and lockfile ownership, pnpm lifecycle policy,
direct release age, native vulnerability audit, and OSV scanning. The removed repository scripts
must not be recreated as parallel enforcement paths.

`eslint.config.js`, `.prettierrc.json`, and `knip.json` remain because parser/project roots,
project-specific lint tightening, formatting choices, and entry-point ownership are target facts.
They do not own shared thresholds or command orchestration.

## Target-specific providers

The following checks remain local because Code Policy cannot infer their Setta-specific contracts:

- `scripts/check-package-boundary.mjs` validates the package's exports-only surface, dependency
  imports, consumer imports, fixture template, alias prohibition, and compiled stylesheet markers.
- `scripts/check-workspace-policy.mjs` validates unpublished-package state and strict pnpm settings
  including `trustPolicy: no-downgrade`, strict release-age behavior, and exotic-subdependency
  blocking.
- `scripts/check-lockfile-sync.mjs` performs an isolated, scripts-disabled frozen synchronization
  proof without rewriting the working tree.
- `scripts/check-release-age.mjs` checks every registry package/version in the transitive lockfile;
  shared policy checks direct releases, while this target deliberately retains the stronger
  transitive quarantine.
- `scripts/check-licenses.mjs` applies the project SPDX allowlist. License policy is not provided
  by the shared Node module.
- `scripts/verify-packed-consumer.mjs` builds, packs, installs, and builds a temporary unrelated
  consumer from public exports only.
- `scripts/profile-workspace-performance.mjs` builds the production playground and drives its
  deterministic render, pan, and drag contract in an isolated headless Chrome profile.

The packed consumer's checked-in `package.template.json` is intentionally not an installable
manifest. The verifier materializes it as `package.json` only inside a temporary directory after
replacing the exact tarball placeholder. This keeps the repository manifest graph honest while
preserving the unrelated-consumer proof.

## Toolchain and supply chain

- Node is pinned to `25.2.1`; pnpm is pinned to `10.23.0` and invoked from the standalone
  installation because Corepack is broken on this machine.
- Registry dependencies are exact-pinned. React and React DOM peer ranges describe supported host
  compatibility and have matching exact development dependencies.
- `pnpm-workspace.yaml` enforces a seven-day strict quarantine, fails on missing publication time,
  forbids trust downgrades and exotic subdependencies, disables lockfile trust, and owns the
  lifecycle allowlist.
- `.code-policy.json` is the single exception and minimum-release-age authority. Exceptions remain
  exact, owned, justified, expiring, and require developer approval.
- `dependency-license-policy.json` remains the target's SPDX allowlist.

No mutation engine is configured. Mutation testing is optional supplemental hardening, and the
available Stryker dependency graph violates the repository's pnpm trust policy. Adoption therefore
skips mutation instead of adding a trust exception or a repository-owned mutator.
