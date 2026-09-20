# Open-source readiness plan

Status: active

This plan prepares Setta for an Apache-2.0 release at
`github.com/riteofstring/setta` without publishing an artifact, changing repository visibility,
changing the configured remote, or moving the repository. The first public distribution is the
owned `setta` project on PyPI.

This work introduces no compatibility aliases, migration layers, transitional paths, or duplicate
implementations. Deferred public-identity changes happen once at the final cutover.

## Intended public shape

Setta is one product with four applications:

- Python Canvas
- Realtime
- Review
- Experiment Lens

The repository has three shared implementation packages:

- `packages/workspace` is the application-neutral React workspace and interaction system.
- `packages/local-backend` is the application-neutral Go infrastructure used by the four native
  servers.
- `packages/setta-runtime` is the Python CLI, application registry, native-server supervisor, and
  wheel assembler.

The package dependency direction remains one-way: applications consume the shared packages, and
shared packages do not import application code. A shared extraction requires at least two current
consumers with the same complete contract and must remove more coordination and failure paths than
it introduces.

## Repository organization and naming

- [x] Move the Workspace-only playground out of `apps/` to
      `examples/workspace-playground`. This makes `apps/` accurately contain the four products while
      retaining the playground as Workspace's development and browser-acceptance host.
- [x] Rename its private package to `@setta/workspace-playground` and update governed tooling,
      paths, tests, and current design documentation.
- [x] Rename each frontend's `src/backend` directory to `src/api`. The Go service remains the
      backend; the TypeScript directory is a client and generated wire-contract boundary.
- [x] Rename the private root JavaScript package from `setta-workspace-root` to `setta-monorepo`.
- [x] Add a short `packages/README.md` that explains the three shared packages and their dependency
      direction.
- [x] Keep the names `workspace`, `local-backend`, and `setta-runtime`. They describe distinct and
      stable responsibilities; collapsing them would obscure the language and lifecycle boundaries.

The Go module names continue to use their current repository-local identities during this phase.
Changing them to `github.com/riteofstring/setta/...` before that repository exists would replace
working local identities with unresolved public ones. The module-path cutover is an atomic final
repository-move task.

## Shared functionality

### Extract now

- [x] Add `local-backend/artifacthttp` for the exact passive-artifact HTTP contract shared by
      Review and Experiment Lens: the closed inline-media allowlist, strict `download=1` query,
      sandboxed preview headers, and content response headers. Routes, artifact identity, verified
      file admission, and product error documents remain application-owned.
- [x] Add private `setta.apps` support functions for the option grammar and live-session identity
      request duplicated by all four runtime adapters. Also consolidate identical bounded local-file
      and JSON-response mechanics used by Realtime, Review, and Experiment Lens while retaining their
      commands, limits, URLs, error wording, and native invocation policy.

### Do not extract now

- Do not add a generic revisioned store. Review and Experiment Lens still require product-specific
  identity, initialization, validation, cloning, encoding, error, and publication policy.
- Do not add a shared artifact UI to Workspace. The applications have different admission,
  fallback, download, structured-value, and runtime-reference semantics.
- Do not add `@setta/local-client` yet. The browser clients share mechanics, but their conflict,
  optimistic projection, stream, and runtime semantics do not form one complete contract.
- Keep product schemas, generated contracts, contract generators, routes, coordinators, charts,
  drawing runtimes, evidence views, and projections with their applications.

`packages/local-backend` does not need a playground. It has no interactive surface: its useful
acceptance boundary is its quick temporary-state suite plus the four consuming servers' boundary
tests. A synthetic backend playground would add a fifth route and lifecycle model without testing
a real consumer.

## Public project assets

- [x] Add human-facing contribution, support, security, and conduct policies.
- [x] Add issue forms and a pull-request template that route bug reports, feature proposals,
      security reports, and support requests appropriately.
- [x] Add a changelog with an Unreleased section.
- [x] Point the public README to contributor and support documentation rather than agent-only
      repository instructions.
- [x] Document the package layout for source readers.
- [x] Keep the Apache-2.0 `LICENSE` and include it in every wheel.
- [ ] Audit the compiled wheel's third-party license and notice closure. Every bundled frontend and
      native dependency must have its required attribution in the wheel before publication.
- [ ] Decide whether Setta's name and logo need a separate trademark policy before the repository
      becomes public. Do not imply a trademark grant or restriction without an owner decision.

CODEOWNERS and private vulnerability-reporting configuration depend on the final GitHub team or
maintainer handles, so they are part of the repository cutover rather than guessed locally.

### Local license-audit result

The 2026-09-23 local audit found that the wheel's attribution closure is not ready for publication.
The installed production dependency closures for the four browser applications contain 355 pnpm
package records: 316 expose a top-level license file and 39 require inherited or separately sourced
license evidence. The initial wheel license directory carried 11 third-party files and omitted
clear runtime examples such as React, CodeMirror, dnd-kit, Radix, XTerm, and XYFlow. The exact Go
module closure was verified with the policy-pinned toolchain, and licenses for `coder/websocket`,
`creack/pty`, Tree-sitter, `x/sys`, and `go-pointer` are now included in the wheel. The browser
attribution gap remains open.

Before publication, generate or curate notices from the exact production browser graph and linked
Go graph, account for packages whose installed leaf omits its monorepo license, and inspect the
license inventory in every platform wheel. Over-inclusion is acceptable; missing required notices
is not. The separately installed `basedpyright` and `nodejs-wheel-binaries` distributions currently
carry their own license files. No additional runtime library is needed to complete this work.

## Python distribution

PyPI is the initial binary distribution channel. The maintainers control the existing `setta`
project, so no package-name migration is required.

- [x] Use one checked-in version authority for package code, wheel names, and wheel metadata.
- [x] Emit current core metadata with the README as the long description, Apache-2.0 as the SPDX
      license expression, author names, keywords, classifiers, and packaged license-file declarations.
- [x] Preserve the current five-platform wheel matrix and installed-wheel smoke tests.
- [x] Continue publishing platform wheels only. The package contains compiled native servers and
      built web applications; the current source tree is not an installable source distribution.
- [ ] Add final project URLs only when `github.com/riteofstring/setta` exists.
- [ ] Configure PyPI Trusted Publishing for the final GitHub repository and a protected `pypi`
      environment, then add a digest-pinned publish job that consumes the already-tested wheel
      artifacts without rebuilding them.
- [ ] Test the complete wheel set against TestPyPI before the first production upload.

The final two items require external repository and registry configuration and remain gated in this
local phase.

## JavaScript and Go distribution

Do not publish an npm package for the first Setta release. `@setta/workspace` is an internal source
dependency today, and end users receive its compiled output in the `setta` wheels. npm publication
would create a second public compatibility promise, release identity, provenance path, and support
surface without a current external consumer. Revisit it only when Workspace has an independently
supported public API, npm scope ownership, package metadata, semver policy, and packed-consumer
release tests.

Do not publish a separate Go module release initially. `local-backend` is implementation
infrastructure compiled into Setta's native servers. Its source will be visible in the public
monorepo, but it has no supported external API or separate release cadence. If external Go
consumers emerge, establish the canonical GitHub module path and module-specific tags deliberately.
Go normally resolves modules directly from their canonical version-control path, often through the
public Go module proxy and checksum database; there is no separate registry upload analogous to npm
or PyPI. A nested public module would use tags such as `packages/local-backend/v0.1.0`.

## External dependencies and services

Add no runtime library for this work. The shared contracts are already implemented with the Go,
Python, and browser standard libraries, and another router, storage framework, HTTP client, release
framework, or UI toolkit would duplicate existing owners.

For publication, prefer PyPI Trusted Publishing and the official PyPA GitHub Action rather than a
long-lived API token. Admit and pin that action only when the final repository and protected GitHub
environment exist. Existing Code Polishy dependency and supply-chain checks remain the dependency
admission gate.

## Final public cutover

The following operations are intentionally not authorized by this plan's local implementation
phase:

1. Create or transfer the repository to `github.com/riteofstring/setta` and choose public
   visibility.
2. Rewrite the Git remote and Go module/import paths to the canonical public URL in one coherent
   change.
3. Add live project URLs to Python metadata and documentation.
4. Configure GitHub environments, PyPI Trusted Publishing, repository security reporting,
   CODEOWNERS, branch protection, and required checks.
5. Build the immutable release candidate, verify all five wheels, create the release tag, and test
   the exact artifacts on TestPyPI.
6. Publish those unchanged artifacts to PyPI.

Push, visibility, transfer, tag, TestPyPI, and PyPI operations require separate explicit approval.

## Local execution result

The 2026-09-23 changed-impact test matrix and offline supply-chain check pass. Exact static checks
for the new and modified implementation boundaries also pass. The repository-wide changed-scope
static scan adds no selected errors, but it remains blocked by four existing findings outside the
task-owned edits: two complexity findings in the Experiment Lens command, one import-order finding
in the wheel-smoke acceptance module, and the sealed JavaScript analyzer's 5,000-result limit.

## Completion criteria

The local phase is complete when the repository clearly presents four apps, three shared packages,
and one Workspace example; the two approved shared contracts have one implementation; public
project documentation is present; wheel metadata and license packaging are locally verifiable; all
affected focused and change-aware checks pass; and the changes are committed without changing any
remote service.
