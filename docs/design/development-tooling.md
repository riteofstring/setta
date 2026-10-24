# Development tooling rationale

This document owns current non-local rationale for the directly mapped workspace build, Vitest
setup, and Chrome DevTools launcher files. Product runtime behavior remains in the module design
records.

## Hosted verification

Package checks run on GitHub-hosted Linux for source and toolchain changes. They cover the
Workspace, Playground, and local-backend boundary suites and the Workspace browser interactions.
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

## Development server security

The Playground development server serves authored source and supports Vite's ordinary page and
module transforms. It does not launch desktop editors from HTTP requests. Its Vite configuration
registers a rejection handler for `/__open-in-editor` under Vite's configured base before Vite
installs its editor middleware.
This removes the request-to-process path on every supported host, including Windows and WSL.
Developers can still open files directly in their editor and use Vite's error overlay and reloads.
The boundary test starts the actual configuration with temporary content, verifies normal page
serving, and requires editor requests to return HTTP 403 at both the root and a nested URL base.

The dependency assessment in
[`docs/security/dependency-assessment-2026-10-09.md`](../security/dependency-assessment-2026-10-09.md)
records the affected release and bounded remediation dates. This server restriction also avoids
granting future browser requests authority to start local applications after the dependency patch.

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
The workspace and playground test configurations alias only the `@uiw` entries to ESM, matching the
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

## Live Playground inspection

The Workspace-only playground lives under `examples/` because it exercises the published package
without being a product of its own. Its private package name makes that ownership explicit while
retaining an ordinary workspace dependency.

`pnpm workspace:playground:inspect` launches an isolated headless Chrome target against an already
running Playground. It does not build the package, start a server, or run an application test suite. The
default route waits for the real workspace shell and XYFlow surface, records their computed
geometry, captures a viewport screenshot, reports browser exceptions and console errors, and exits
nonzero when a measured layout invariant fails. A URL with `focused-section` selects the focused
route inspection: it waits for the public standalone section root; records its content, frame,
header, body, and descendant geometry; and requires both the root and section frame to fill their
owners.

The Playground resolves `@riteofstring/setta` from its built package. Start it with
`pnpm workspace:playground`; that initial command builds the workspace. After any workspace source
change, run `pnpm --filter @riteofstring/setta run build` before inspection because the running Vite
process does not hot-reload unbuilt package source.

The default target is `http://localhost:5174/`, the default viewport is 1492 by 696 CSS pixels, and
the default screenshot is `/tmp/setta-playground-inspection.png`. Callers can provide `--url`,
`--width`, `--height`, `--screenshot`, and `--chrome-binary`; `--require-tabs` additionally requires
the saved-view tab strip in every route mode. Browser-visible work is inspected through this command
before handoff, and the resulting image is reviewed alongside the JSON receipt rather than inferred
from source or build output.

```sh
pnpm workspace:playground:inspect -- --width 630 --height 364 --require-tabs \
  --screenshot /tmp/setta-playground-tabs.png
pnpm workspace:playground:inspect -- \
  --url 'http://localhost:5174/?focused-section=root-group&color-mode=light' \
  --screenshot /tmp/setta-playground-focused-section.png
```

The focused Playground route accepts `color-mode=light` or `color-mode=dark` so both appearances
can be inspected deterministically.

The inspection command and the production performance profile share one headless-Chrome lifecycle
owner and the same CDP client. This keeps Chrome discovery, isolated profiles, startup timeouts,
and cleanup consistent without coupling visual inspection to the performance suite.

## Workspace browser interaction acceptance

`pnpm workspace:browser:test` builds Workspace and Playground, serves the production Playground,
and drives an isolated Chrome target through the real XYFlow input path. The modifier-drag
acceptance starts with focus outside Workspace and moves a section on its first Cmd/Ctrl drag from
content that normally exercises XYFlow's no-drag filter. The marquee acceptance keeps the default
floating windows open and Shift-drags from a bare pane point through the checklist window. Every
sampled move must retain positive marquee geometry while the viewport stays fixed; mouse-up must
produce a multi-section selection without closing the window or reporting a browser error.

This suite owns browser event routing and gesture lifecycle acceptance. Package tests cover nested
section and item sorting, collision resolution, cancellation, and window state transitions. Live
Playground inspection verifies current geometry and captures screenshots for visual review.

## Historical renderer evidence

The completed upstream-renderer migration's capture tools and immutable reference comparisons are
preserved together in the [historical evidence archive](../evidence/README.md). Current verification
uses the package and browser interaction suites without rebuilding the retired renderer's fixtures.

## Production performance profile

The production profile builds Workspace and Playground, serves the deterministic 256-section
route, and writes one machine-local JSON record:

```sh
pnpm performance:profile -- --output /tmp/setta-workspace-performance.json
```

The acceptance decision prioritizes activation and sustained frame gaps, first visible mutation,
long tasks, complete mounted-node counts, and absence of host-page scroll or browser errors.
Scripting, style, layout, and total task duration remain recorded so a renderer change cannot hide
extra CPU work behind a smooth frame cadence.
