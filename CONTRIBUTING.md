# Contributing to Setta

Thank you for helping improve Setta. Bug fixes, documentation, tests, and focused feature proposals
are welcome.

## Before you start

Use an issue to describe substantial behavior or architecture changes before investing in an
implementation. Small, well-scoped fixes can go directly to a pull request.

Setta is a monorepo with four example apps under `apps/`, shared code under `packages/`, and runnable
examples under `examples/`. Read the relevant design note in [`docs/design`](docs/design/) before
changing an established boundary.

## Source setup

Clone this repository, enter its root, and install these pinned tools:

| Tool    | Version                                  |
| ------- | ---------------------------------------- |
| Python  | 3.12 or newer; CI uses 3.12.13           |
| Node.js | 25.2.1 (`.node-version`)                 |
| pnpm    | 10.23.0 (`package.json`)                 |
| uv      | 0.8.19 (`uv.toml`)                       |
| Go      | 1.26.9 (the backend `.go-version` files) |

Native builds also need a C compiler: Xcode Command Line Tools on macOS, GCC on Linux, or a
64-bit MinGW-w64 toolchain on Windows. Git is needed by the Review example. The supported targets
are macOS 13+ on Intel and Apple Silicon, Linux on amd64 and arm64, and Windows amd64.

Bootstrap Code Polishy, review dependencies, and install the frozen graphs without dependency
build scripts:

```sh
./code-polishyw setup
./code-polishyw dependency-review --base origin/main
pnpm install --frozen-lockfile --ignore-scripts
uv sync --frozen --no-build --no-install-project
./code-polishyw supply-chain --offline
./code-polishyw doctor
```

On PowerShell use `.\code-polishyw.ps1` and `python` in place of `./code-polishyw` and `python3`.
Use the actual target branch in place of `origin/main` when contributing elsewhere. Resolve security or policy findings before proceeding.

Run `pnpm experiment-lens:playground`, `pnpm realtime:playground`, or `pnpm review:playground` to
build and open an example app. The process stays running after the command returns; use the
same command with `--stop` to stop it.
These commands preserve their working examples beneath ignored `tmp/` directories. The Realtime
example also installs its frozen Pillow dependency into that example's isolated environment.

For any app command, use the repository-local runner:

```sh
python3 packages/setta-runtime/scripts/run_local_setta.py apps
python3 packages/setta-runtime/scripts/run_local_setta.py realtime open \
  --project-root ./my-app --create
```

The runner caches its current build under `build/setta-wheel/local-environments`. Each rebuild
gets a separate installation so existing playgrounds keep working. App READMEs use the shorter
`setta` command; substitute the runner above. After stopping all local apps, that ignored directory
can be removed to reclaim disk space; the next launch builds again.
Linux local wheels use a host-specific `linux_*` tag. The five-platform CI matrix separately builds
and verifies portable release wheels, including manylinux 2.28. No workflow publishes to PyPI.

## Development workflow

Use the narrowest test that exercises your change while developing. Before opening a pull request,
run the repository's change-aware checks against the branch you intend to merge into:

```sh
./code-polishyw test --changed --base origin/main
```

Keep generated files in sync, add tests for observable behavior, and avoid unrelated formatting or
cleanup in the same pull request. Never include credentials, private project data, or generated
runtime state.

Browser acceptance needs Chrome. On Linux or Windows set `PYTHON_CANVAS_CHROME_BINARY`,
`REALTIME_CHROME_BINARY`, `REVIEW_CHROME_BINARY`, and `EXPERIMENT_LENS_CHROME_BINARY` to its absolute
executable path. On macOS, Python Canvas requires a raw `chrome-headless-shell` executable; the
other suites also support installed Google Chrome. Workspace's interaction script accepts
`--chrome-binary PATH`. Hosted CI runs these checks on Linux with its installed Chrome.

After a production dependency change, regenerate and review the bundled notices with
`python3 packages/setta-runtime/scripts/frontend_notices.py --write`. Its default mode checks the
current inventory without network access. Packages that omit their license file have exact,
sourced supplements in `packages/setta-runtime/license-sources/frontend.json`.

## Pull requests

Explain the user-visible outcome, the boundary affected, and how you verified it. A maintainer may
ask for a smaller change or an issue first when a proposal creates a new public compatibility
surface.

By submitting a contribution, you agree that it is licensed under the repository's
[Apache License 2.0](LICENSE).
