# Contributing to Setta

Thank you for helping improve Setta. Bug fixes, documentation, tests, and focused feature proposals
are welcome.

## Before you start

Use an issue to describe substantial behavior or architecture changes before investing in an
implementation. Small, well-scoped fixes can go directly to a pull request.

Setta is a monorepo with four products under `apps/`, shared code under `packages/`, and runnable
examples under `examples/`. Read the relevant design note in [`docs/design`](docs/design/) before
changing an established boundary.

## Development workflow

The repository pins its build tools and dependency locks. Start by checking the local environment:

```sh
./code-polishyw doctor
```

Use the narrowest test that exercises your change while developing. Before opening a pull request,
run the repository's change-aware checks against the branch you intend to merge into:

```sh
./code-polishyw test --changed --base origin/main
```

Keep generated files in sync, add tests for observable behavior, and avoid unrelated formatting or
cleanup in the same pull request. Never include credentials, private project data, or generated
runtime state.

## Pull requests

Explain the user-visible outcome, the boundary affected, and how you verified it. A maintainer may
ask for a smaller change or an issue first when a proposal creates a new public compatibility
surface.

By submitting a contribution, you agree that it is licensed under the repository's
[Apache License 2.0](LICENSE).
