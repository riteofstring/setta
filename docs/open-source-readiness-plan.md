# Open-source readiness plan

Status: active

This plan prepares Setta for an Apache-2.0 release at
`github.com/riteofstring/setta` without publishing an artifact, changing repository visibility,
changing the configured remote, or moving the repository. The public repository is a source
preview. PyPI publication is deferred; contributor instructions build a local installation.

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
- [x] Audit the compiled wheel's third-party license and notice closure. Every bundled frontend and
      native dependency must have its required attribution in the wheel before publication.
- [ ] Decide whether Setta's name and logo need a separate trademark policy before the repository
      becomes public. Do not imply a trademark grant or restriction without an owner decision.

CODEOWNERS and private vulnerability-reporting configuration depend on the final GitHub team or
maintainer handles, so they are part of the repository cutover rather than guessed locally.

### Local license-audit result

The 2026-10-09 browser inventory includes 374 exact installed dependency releases across the
four apps. `frontend_notices.py` collects published license and notice files and exact sourced
supplements for the 45 releases whose archive omits a top-level license file. This deliberately
includes optional and tree-shaken code. The wheel also includes Go's standard-library notice,
vendored Workspace notices, and the previously collected native dependency notices. Every
platform's build checks the generated frontend inventory, and wheel tests inspect its packaged
license directory. The separately installed `basedpyright` and `nodejs-wheel-binaries`
distributions carry their own notices.

## Python distribution

PyPI publishing is deferred. The maintainers control the existing `setta` project, but the
placeholder is not an installable preview of these applications. Documentation must direct users
to the source setup until binary distribution is explicitly selected.

- [x] Use one checked-in version authority for package code, wheel names, and wheel metadata.
- [x] Emit current core metadata with the README as the long description, Apache-2.0 as the SPDX
      license expression, author names, keywords, classifiers, and packaged license-file declarations.
- [x] Preserve the current five-platform wheel matrix and installed-wheel smoke tests.
- [x] Build platform wheels only. The package contains compiled native servers and
      built web applications; the current source tree is not an installable source distribution.
- [ ] Add final project URLs only when `github.com/riteofstring/setta` exists.
- [ ] Deferred: configure PyPI Trusted Publishing for the final GitHub repository and a protected `pypi`
      environment, then add a digest-pinned publish job that consumes the already-tested wheel
      artifacts without rebuilding them.
- [ ] Deferred: test the complete wheel set against TestPyPI before the first production upload.

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

The 2026-10-09 source bootstrap passes dependency review, frozen script-disabled installation,
offline supply-chain checks, and notice verification in a fresh checkout. Online security checks
pass with 18 exact npm non-exposure assessments and five Go 1.26.9 release-age admissions, all
expiring on November 7. The source quickstart, app draft recovery, Realtime starter, and local Linux
packaging are implemented. The previous Go complexity and Python import-order findings are fixed.

Code Polishy is pinned to 0.28.2. Its repository-wide JavaScript check still encounters an upstream
result-limit defect: the Realtime, Review, and Lens generated validators produce 6,541 intermediate
complexity/depth diagnostics and 21 comment records. Their generated-code exemptions are applied
after the sealed analyzer's 5,000-result limit. Reproduce with:

```sh
./code-polishyw check --module realtime-frontend --module review-frontend --module experiment-lens-frontend
```

Individual module checks fit within the limit and retain all rules. Hosted CI runs every declared
module separately, but a complete checkpoint remains blocked until Code Polishy handles generated
output before the aggregate limit or batches its analysis. This is an open tooling issue, not a
passing repository-wide gate.

## Completion criteria

The local phase is complete when the repository clearly presents four apps, three shared packages,
and one Workspace example; the two approved shared contracts have one implementation; public
project documentation is present; wheel metadata and license packaging are locally verifiable; all
affected focused and change-aware checks pass; and the changes are committed without changing any
remote service.
