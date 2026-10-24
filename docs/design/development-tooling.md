# Development tooling rationale

This document owns current non-local rationale for the directly mapped workspace build, Vitest
setup, and Chrome DevTools launcher files. Product runtime behavior remains in the module design
records.

## Hosted verification

Package checks run on GitHub-hosted Linux for source and toolchain changes. They cover the
Workspace and local-backend boundary suites and the Workspace browser interactions.
The browser script receives the runner's explicit Chrome path and isolates its own profile. The
job builds Workspace's public declarations before checking imports. These workflows publish
nothing.

Static checks use one repository-wide `./code-polishyw check --all` invocation. Syntax, semantic
lint, and authored-source checks remain active.

All workflows bootstrap the repository's pinned Code Polishy release, review dependencies before
frozen script-disabled installation, and verify installed metadata afterward. Scheduled security
monitoring uses the same wrapper on a hosted runner; it does not depend on an obsolete private
runner label or a global Code Polishy install.
The weekly scan's shell function routes the literal `code-polishy supply-chain` command recognized
by monitoring policy through `./code-polishyw`; command discovery never selects a global release.

The root `.node-version` owns the development runtime selection. Package engines and the packed
consumer template must agree with it, and CI reads that same file. The workspace publication check
validates agreement instead of carrying another independent runtime version. After frozen
installation, CI and contributor setup run the complete supply-chain profile so repository
providers deferred by pre-install dependency review execute against the installed tree.

## Browser fixture server

Browser checks build the private `fixtures/packed-consumer` application from public package exports.
Its default route exercises the unrelated-consumer contract; `?fixture=interactions` contains only
the editor, text-control drag target, nested sorting group, selection targets, and floating window needed by browser
regressions. `?fixture=performance` contains the fixed 256-section workload.

The interaction, performance, and packed-consumer checks share one static server. It reads the built
HTML and assets into a closed file map, binds an ephemeral loopback port, and serves only those
files. Requests never reach source transforms, filesystem path resolution, or desktop editor
launching. Each harness closes its server and isolated Chrome profile when it finishes. The
repository has no authored Vite development-server command.

The public demonstration belongs to `setta-site`. This fixture owns package regression coverage,
not a component gallery or a second product interface. Package component suites retain the full
control, nested sorting, window recovery, saved-view, and standalone-section behavioral contracts.

## Workspace build and CodeMirror module identity

The workspace library build emits readable ESM with a source map. Package-relative modules and
the private CodeMirror/Lezer/UIW editor runtime bundle together. Other declared dependencies and
React peers remain external. An unrelated installation may resolve the editor wrappers' broad
peer ranges to a different CodeMirror state or view version; mixing their extensions crashes the
editor even when the application builds. Bundling the locked editor graph preserves one runtime
identity without asking consumers for resolution aliases or overrides. Consumers own final
application minification, and the built-package boundary check verifies emitted imports.

The build emits `EDITOR-NOTICES.txt` from the installed packages that contribute bundled modules.
Exact source-linked license supplements cover UIW releases that omit license text from their npm
archives. The supplements retain the same upstream notices used by the native distribution.

The `@uiw` CodeMirror packages have no exports map. Vitest's node-style resolution otherwise lands
on their CommonJS main files while workspace source imports the ESM CodeMirror packages. That
creates two instances of the same `@codemirror/*` versions and breaks extension identity checks.
The workspace test configuration aliases only the `@uiw` entries to ESM, matching the
browser module graph used by the library build.

## Browser test shims

`@dnd-kit/dom` constructs `ResizeObserver` during module import, so the Vitest setup must install
that constructor before any component test module loads. The shim supplies lifecycle methods only;
individual tests own any meaningful measurement behavior they need.

jsdom does not measure DOM ranges. CodeMirror pointer-coordinate lookup calls
`Range#getClientRects`; the setup returns an empty rectangle list so the lookup follows its normal
no-geometry path instead of throwing. Browser builds retain real geometry.

## Chrome DevTools launcher

The CDP profile suffix forces the `C` locale around macOS `shasum`. The system command is a Perl
script and may crash when a caller supplies an unsupported locale such as `C.UTF-8`; hashing the
worktree path does not require locale-dependent behavior.

The port resolver first reads the worktree-specific running browser PID. macOS shells can expose
different `TMPDIR` values, placing the same browser's PID file outside the current computed run
directory, so the resolver also scans running Chrome commands for the exact worktree profile path.
That fallback still derives identity from the worktree-specific profile and does not attach to an
arbitrary browser.

`chrome-devtools-mcp` is exact-pinned because its transport and command-line grammar are part of the
local development boundary. The launcher uses the required camel-case `--browserUrl` option.
Warnings and banners are redirected to a timestamped log because unexpected stderr during startup
can corrupt the MCP transport stream; protocol stdout remains clean.

## Workspace browser interaction acceptance

`pnpm workspace:browser:test` builds Workspace and the private browser fixture, serves its compiled
assets, and drives an isolated Chrome target through the real XYFlow input path. It checks opaque,
pinned editor gutters in both color modes. The modifier-drag acceptance starts with focus outside
Workspace and moves a section on its first Cmd/Ctrl drag from content that normally exercises
XYFlow's no-drag filter. The marquee acceptance keeps a floating window open and Shift-drags from
a bare pane point through that window. Every sampled move must retain positive marquee geometry
while the viewport stays fixed; mouse-up must select multiple sections without closing the window
or reporting a browser error. Nested sorting must activate its temporary drag placeholder, preserve
the original order on Escape, and accept a subsequent drag that commits the expected new order.

Package tests cover nested section and item sorting, collision resolution, cancellation, and window
state transitions. These browser checks retain their interaction assertions independently of the
public website's content and deployment.

For visual inspection of the tested fixture, capture a screenshot in the same browser run and
review it alongside the command's interaction result:

```sh
pnpm workspace:browser:test -- --screenshot /tmp/setta-browser-fixture.png
```

`--skip-build` reuses an existing local build; `--chrome-binary` selects an explicit Chrome binary.
The fixture imports compiled package exports, so rebuild after library or fixture changes.

## Historical renderer evidence

The completed upstream-renderer migration's capture tools and immutable reference comparisons are
preserved together in the [historical evidence archive](../evidence/README.md). Current verification
uses the package and browser interaction suites without rebuilding the retired renderer's fixtures.

## Production performance profile

The production profile builds Workspace and the same private fixture, serves its deterministic
256-section route, and writes one machine-local JSON record:

```sh
pnpm performance:profile -- --output /tmp/setta-workspace-performance.json
```

The acceptance decision prioritizes activation and sustained frame gaps, first visible mutation,
long tasks, complete mounted-node counts, and absence of host-page scroll or browser errors.
Scripting, style, layout, and total task duration remain recorded so a renderer change cannot hide
extra CPU work behind a smooth frame cadence.
