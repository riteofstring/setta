# Development tooling rationale

This document owns current non-local rationale for the directly mapped workspace build, Vitest
setup, and Chrome DevTools launcher files. Product runtime behavior remains in the module design
records.

## Workspace build and CodeMirror module identity

The workspace library build emits readable ESM with a source map. Package-relative modules bundle;
bare specifiers remain external because each is a declared runtime dependency or peer. Consumers
own final application minification, and the built-package boundary check verifies the emitted
imports.

The `@uiw` CodeMirror packages have no exports map. Vitest's node-style resolution otherwise lands
on their CommonJS main files while workspace source imports the ESM CodeMirror packages. That
creates two instances of the same `@codemirror/*` versions and breaks extension identity checks.
The workspace and playground test configurations alias only the `@uiw` entries to ESM, matching the
browser module graph without changing library build output.

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
