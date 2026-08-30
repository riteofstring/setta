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

## Live Playground inspection

`pnpm playground:inspect` launches an isolated headless Chrome target against an already running
Playground. It does not build the package, start a server, or run an application test suite. The
default route waits for the real workspace shell and XYFlow surface, records their computed
geometry, captures a viewport screenshot, reports browser exceptions and console errors, and exits
nonzero when a measured layout invariant fails. A URL with `focused-section` selects the focused
route inspection: it waits for the public standalone section root; records its content, frame,
header, body, and descendant geometry; and requires both the root and section frame to fill their
owners.

The Playground resolves `@setta/workspace` from its built package. Start it with
`pnpm --dir apps/playground dev`; that initial command builds the workspace. After any workspace
source change, run `pnpm --filter @setta/workspace run build` before inspection because the running
Vite process does not hot-reload unbuilt package source.

The default target is `http://localhost:5174/`, the default viewport is 1492 by 696 CSS pixels, and
the default screenshot is `/tmp/setta-playground-inspection.png`. Callers can provide `--url`,
`--width`, `--height`, `--screenshot`, and `--chrome-binary`; `--require-tabs` additionally requires
the saved-view tab strip in every route mode. Browser-visible work is inspected through this command
before handoff, and the resulting image is reviewed alongside the JSON receipt rather than inferred
from source or build output.

```sh
pnpm playground:inspect -- --width 630 --height 364 --require-tabs \
  --screenshot /tmp/setta-playground-tabs.png
pnpm playground:inspect -- \
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

This suite owns browser event routing and gesture lifecycle acceptance. The parity harness owns
visual comparison. Its deterministic screenshot setup closes floating windows for several canvas
scenarios, so it cannot substitute for the interaction suite's live pane-to-overlay path.

## Upstream canvas renderer parity evidence

The XYFlow parity harnesses compare the current upstream-backed renderer against immutable captures
from the accepted pre-cutover reference commit. Playground capture owns the Workspace and
managed-window catalog; Python Canvas capture owns its registered section kinds, canonical
projection states, terminal presentation, themes, and viewport variants. Both captures record
screenshots, computed geometry, canonical documents, focus and interaction state, fixture identity,
browser identity, source identity, and built-artifact hashes. Candidate output always goes to a new
caller-selected directory.

```sh
node scripts/xyflow-parity/capture-playground.mjs --mode candidate \
  --reference-commit 65f8cafa94c2c4768622ae570f6051332158ddc8 \
  --output-dir /tmp/setta-playground-candidate
node scripts/xyflow-parity/compare-playground.mjs \
  --baseline-dir "$PWD/docs/evidence/xyflow-12-cutover/baseline/playground" \
  --candidate-dir /tmp/setta-playground-candidate \
  --output-dir /tmp/setta-playground-comparison
node apps/python-canvas/visual-parity/capture.mjs --mode candidate \
  --reference-revision 65f8cafa94c2c4768622ae570f6051332158ddc8 \
  --output /tmp/setta-python-canvas-candidate
node apps/python-canvas/visual-parity/compare.mjs \
  --baseline-dir "$PWD/docs/evidence/xyflow-12-cutover/baseline/python-canvas" \
  --candidate-dir /tmp/setta-python-canvas-candidate \
  --output-dir /tmp/setta-python-canvas-comparison
```

Comparison requires exact scenario and image dimensions, exact captured contracts, and no
unexplained geometry difference above 0.25 CSS pixels. Ordinary pixel tolerance is four channel
values. Font and raster antialiasing may consume at most 128 edge pixels at a channel difference
of 16. A separate bounded edge-raster allowance accepts at most 36 pixels across four components;
each component is at most 6 by 3 pixels and 12 pixels total, every accepted pixel must remain next
to matching edge contrast in both images, and no channel may differ by more than 68. These bounds
admit isolated rasterization noise and reject coherent movement, recoloring, missing content, or a
redesign. A human reviews the full baseline and candidate images plus every nonempty diff.

The checked-in `docs/evidence/xyflow-12-cutover` directory is the historical acceptance record for
the completed migration. It is neither an active implementation plan nor a second renderer source;
retaining it preserves the visual and performance proof without giving it design authority.

The production profile builds Workspace and Playground, serves the deterministic 256-section
route, and writes one machine-local JSON record:

```sh
pnpm performance:profile -- --output /tmp/setta-workspace-performance.json
```

The acceptance decision prioritizes activation and sustained frame gaps, first visible mutation,
long tasks, complete mounted-node counts, and absence of host-page scroll or browser errors.
Scripting, style, layout, and total task duration remain recorded so a renderer change cannot hide
extra CPU work behind a smooth frame cadence.
