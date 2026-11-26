# Contributing to Setta

Thank you for helping improve Setta. Bug fixes, documentation, tests, and focused feature proposals
are welcome.

## Before you start

Use an issue to describe substantial behavior or architecture changes before investing in an
implementation. Small, well-scoped fixes can go directly to a pull request.

Setta is a monorepo with its distributable package under `packages/` and private browser fixtures
under `fixtures/`. Read the [workspace](docs/design/workspace.md) or
[development tooling](docs/design/development-tooling.md) design note before changing an
established boundary.

## Source setup

Clone this repository, enter its root, and install these pinned tools:

| Tool    | Version                   |
| ------- | ------------------------- |
| Node.js | 26.10.0 (`.node-version`) |
| pnpm    | 10.23.0 (`package.json`)  |

The Code Polishy tooling supports macOS 13+ on Intel and Apple Silicon, Linux on amd64 and arm64,
and Windows amd64. The published Setta package runs in the browser.

Bootstrap Code Polishy, review dependencies, and install the frozen graphs without dependency
build scripts:

```sh
./code-polishyw setup
./code-polishyw dependency-review --base origin/main
pnpm install --frozen-lockfile --ignore-scripts
./code-polishyw supply-chain
./code-polishyw doctor
```

On PowerShell use `.\code-polishyw.ps1` in place of `./code-polishyw`.
Use the actual target branch in place of `origin/main` when contributing elsewhere. Resolve security or policy findings before proceeding.

### Build the package

Build the current package with `pnpm --filter @riteofstring/setta build`, then install the
resulting `packages/workspace/setta.tgz` from your consuming application.

Run `pnpm workspace:browser:test`
for browser regressions and `pnpm consumer:check` for the packed artifact contract. The ambient
instrument at [setta.dev/demo](https://setta.dev/demo/) is maintained separately.

## Development workflow

Use the narrowest test that exercises your change while developing. Before opening a pull request,
run the repository's change-aware checks against the branch you intend to merge into:

```sh
./code-polishyw check --git-changes
./code-polishyw test --changed --base origin/main
```

Keep generated files in sync, add tests for observable behavior, and avoid unrelated formatting or
cleanup in the same pull request. Never include credentials, private project data, or generated
runtime state.

Browser acceptance needs Chrome. The Workspace interaction script accepts `--chrome-binary PATH`.
Hosted CI runs these checks on Linux with its installed Chrome.

## Pull requests

Explain the user-visible outcome, the boundary affected, and how you verified it. A maintainer may
ask for a smaller change or an issue first when a proposal creates a new public compatibility
surface.

By submitting a contribution, you agree that it is licensed under the repository's
[Apache License 2.0](LICENSE).

## Releases

Maintainers publish annotated version tags using the [release guide](docs/releasing.md).
