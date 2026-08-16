# Quality and supply-chain tooling

Code Policy is the shared enforcement owner for this repository. The repository records project
facts in `.code-policy.json` and requires one exact locally installed release through
`.code-policy.lock.json`; invoke that release with `code-policy`. The engine, analyzers, package
manager used for policy inspection, and scanners are release-owned tools rather than package
dependencies.

## Commands

| Command                                | Purpose                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `code-policy check`                    | Changed-file formatting, lint, type, complexity, dead-code, architecture, shell, and local contracts |
| `code-policy check --all`              | The same static policy over every governed file                                                      |
| `code-policy format`                   | Shared formatter write mode for selected files                                                       |
| `code-policy test --changed`           | Focused tests for changed modules and reverse dependents                                             |
| `code-policy test-levels --base <ref>` | Read-only recommended/full/supplemental execution plan                                               |
| `code-policy supply-chain --offline`   | Exact dependency, lifecycle, lock consistency, source, and license policy                            |
| `code-policy gate`                     | Authorized complete ordinary gate, including online security, builds, and full tests                 |

The locked release owns selection, text hygiene, file-length and TypeScript complexity budgets,
formatting, linting, type checking, dead-code analysis, JavaScript/TypeScript architecture,
package dependency categories, pnpm lock consistency and resolved sources, transitive release
age, dependency licensing, the native pnpm audit, and OSV scanning. React evidence activates from
the manifests. Target-local Prettier, ESLint, TypeScript-analysis, Knip, lock-sync, license, and
release-age enforcement must not be reintroduced as parallel policy paths.

The repository keeps its TypeScript projects and product build tools because language settings and
artifact construction are project facts. Build dependencies such as TypeScript remain pinned in
the package that actually invokes them; Code Policy does not use those dependencies for its own
analysis.

## Target-specific providers and evidence

The remaining local commands enforce Setta contracts the shared engine cannot infer:

- `scripts/check-package-boundary.mjs` validates the compiled-export manifest shape, forbids
  package alias escape hatches, locks the unrelated-consumer fixture placeholder, and—during the
  package build—checks the emitted ESM, declarations, source map, scoped stylesheet, and required
  compiled style markers.
- `scripts/check-workspace-policy.mjs` keeps every package private while publication is undecided,
  forbids premature publication metadata, and locks the repository's Node and pnpm versions.
- Code Policy declares the complete workspace and playground component matrices directly as
  module-scoped suites. Each module also has a smaller focused boundary test.
- `scripts/verify-packed-consumer.mjs` builds and packs the workspace, installs it into a temporary
  unrelated consumer, and builds that consumer from public exports only.
- `scripts/profile-workspace-performance.mjs` builds the production surfaces and drives the
  deterministic render, pan, and drag contract in an isolated headless Chrome profile.

The packed consumer's checked-in `package.template.json` is intentionally not an installable
manifest. The verifier materializes it as `package.json` only inside a temporary directory after
replacing the exact tarball placeholder.

## Toolchain and supply chain

- Node is pinned to `25.2.1` and pnpm to `10.23.0`.
- Registry dependencies are exact-pinned. React and React DOM peer ranges describe supported host
  compatibility and have matching exact development dependencies.
- `.code-policy.json` owns the 30-day minimum release age, low-or-above audit threshold, admitted
  local dependency protocols, SPDX allowlist, typed assessments, and ordinary exceptions.
- `pnpm-workspace.yaml` mirrors the 30-day native quarantine, fails on missing publication time,
  forbids trust downgrades and exotic subdependencies, disables lockfile trust, and owns the empty
  lifecycle allowlist.

No mutation engine is configured. Mutation testing remains optional supplemental hardening and
requires separate authorization. A CI runner must have the exact locked Code Policy release
installed before it can run a gate; policy checks never download their own control plane.
