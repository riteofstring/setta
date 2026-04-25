# Workspace Rendering Options Findings

Date: 2026-04-23
Worktree: `go-rewrite-pixi-scene`
Status: durable findings note for future conversations

## How to use this file

This file is intended to be sufficient context for a future chat on its own.

If a future conversation is pointed at this file with no other preamble, assume:

- the goal is to find the best architecture for Setta's workspace rendering
- the user is open to:
  - Pixi
  - Rust/Wasm
  - Zig
  - Flutter / Skia
  - native desktop rewrites
  - abandoning CodeMirror
  - abandoning DOM-rendered workspace surfaces
- the user wants a fast prototype that proves whether the approach can actually perform
- broad test-passing is not the current priority; proof of viability and performance is

## Product goals

Any serious option must be judged against these goals:

- `settings -> All Settings` must pan and zoom smoothly
- the result must feel closer to a highly optimized native app than to a heavy web page
- the graph must still look like Setta sections, not generic boxes
- first-click editing must work on representative controls
- the resting workspace should not be a large live DOM forest
- the first prototype must get to a credible proof quickly

## Hard constraints and practical realities

### 1. The dominant local problem is not React Flow by itself

Local branch history consistently shows:

- top-level frame/header shells stayed fast
- dense row count caused a big drop
- real param/widget subtrees caused the largest drop

The most important local staged benchmark remains:

- `frame-only`: about `120 FPS`
- `header-only`: about `120 FPS`
- `section-body-shell`: about `100 FPS`
- `static-param-list`: about `69-88 FPS`
- `full`: about `38-43 FPS`

Primary local reference:

- [2026-03-07_settings-all-settings-pan-zoom-benchmark.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md)

### 2. DOM cleanup helps, but does not solve the problem alone

The `frontend-performance*` branches already explored:

- DOM flattening
- subscription partitioning
- observer/listener cleanup
- lazy overlay mounting
- workerized filter work
- minimap tuning
- viewport throttling

These were useful for learning, but none produced the clean end-state required.

Local reference:

- [frontend-performance-branches-retrospective.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/docs/notes/performance/frontend-performance-branches-retrospective.md)

### 3. Big wins only appeared when renderer ownership changed or DOM got out of the hot path

Local history supports this strongly:

- sparse DOM plus scene/canvas ownership can be much faster
- always-live DOM plus scene/canvas does not automatically win
- hybrid DOM/canvas ownership repeatedly collapsed back into the same bottleneck

### 4. First-click editing is an architecture problem

The `go-rewrite-pixijs` branch got far enough to expose the deeper issue:

- retained/resting text can look promising
- but if activation still relies on tiny hidden anchors or pane-owned geometry, first-click editing fails

That branch ended with the conclusion that the system needs scene-authoritative or row-authoritative visible hit geometry for editing activation.

Local reference:

- [2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md)

## Core distinction: "no DOM workspace" means different things

There are three materially different targets:

### A. No DOM-rendered workspace visuals

This is realistic and desirable.

Meaning:

- the workspace is owned by one scene renderer
- no DOM rows/cards/section shells in the xyflow area
- DOM may still exist elsewhere for overlays or hidden input plumbing

### B. No DOM layout ownership, but a hidden input bridge still exists

This is the most realistic browser/Electron-web target.

Meaning:

- the workspace is still visually DOM-free
- a hidden `textarea` / `contenteditable` / small overlay input exists only for:
  - IME
  - clipboard
  - browser text input behavior
  - composition events
- the scene still owns all geometry and all visuals

### C. No DOM at all, even for input plumbing

This is not a practical browser target today.

In the browser/Electron webview model, Wasm still operates alongside JS/browser APIs. Even with a pure scene renderer, text entry and related browser-native behavior become much harder if there is literally no DOM input bridge.

Practical conclusion:

- target `A` at minimum
- `B` is the most realistic high-performance browser architecture
- do not assume `C` is necessary for success

## Electron clarification

If Setta remains a browser-style app inside Electron:

- Chromium is still the platform host
- WebAssembly still integrates through JS/browser APIs
- DOM-free visuals are possible
- fully DOM-free text input is still a bad fit

Electron only becomes a materially different answer if Setta becomes a native desktop app instead of a browser-style app.

## Options considered

## Option 1: stay DOM-first and keep optimizing the current web path

### Verdict

Rejected as the primary strategy.

### Why

Repo history already paid for this.

It can still produce useful hygiene wins, but it is not the right primary lane if the goal is native-feeling dense pan/zoom on `All Settings`.

### When it still makes sense

- narrow bug fixes
- cheap fanout reductions
- cleanup on the legacy fallback path

## Option 2: React/TypeScript shell + one imperative Pixi scene + DOM overlay editors

### Verdict

Best browser-first prototype path.

### What it means

- keep the app shell in React/TS
- replace the workspace with one Pixi-owned scene
- do not use `@pixi/react` for the hot path
- use imperative scene management inside one host component
- mount DOM only for active editors, menus, popovers, chat, and similar exceptions

### Why this is attractive

- fastest path to a credible prototype inside the existing product
- easiest to integrate with current routes, auth, websocket/API work, and app shell
- can recreate real `Callable` and `Dict` sections quickly
- keeps the rewrite scope inside the workspace first

### Why not `@pixi/react`

For the prototype, explicit control is better than JSX convenience.

Reasons:

- it keeps scene management closer to React reconciliation
- it makes trace attribution murkier
- the goal is to prove the hot path, not optimize developer ergonomics

Recommended shape:

- one React `WorkspaceSceneHost`
- inside it, imperative Pixi app/stage/scene objects
- explicit dirty flags, pooling, camera state, and overlay projection

### Text recommendation

If this option is used, dense resting text should not default to plain raster `Text`.

Prefer:

- `BitmapText`
- MSDF/SDF text strategy

### Editors under this option

Use DOM overlay editors for active editing only.

Recommended split:

- short text fields:
  - lightweight overlay input
- code / multiline fields:
  - CodeMirror 6 or Monaco overlay

### Risks

- Pixi text quality during zoom may still fail the canary
- overlay activation geometry must be scene-authored from the start
- if the best win still depends on hiding DOM during motion while DOM remains the true resting owner, this option has not actually succeeded

### Current recommendation level

Recommended as the fastest serious proof.

## Option 3: Rust/Wasm scene core + React/TypeScript host + DOM overlay editors

### Verdict

Best browser architecture if willing to take a bigger jump than Pixi/TS.

### What it means

- Rust/Wasm owns:
  - scene graph
  - camera
  - layout cache
  - picking
  - authoritative geometry
  - rendering
- React/TS owns:
  - app chrome
  - routing
  - network/websocket glue
  - overlay mounting
  - Monaco/CodeMirror or other DOM editors

### Why this is attractive

- better long-term ceiling than a TS-heavy renderer
- scene logic and rendering core can become more native-like
- still keeps the browser host where it is most natural

### Why React/TS host is preferred over Go or Zig host

In the browser, JS is already the natural host.

Adding Go/Wasm or Zig/Wasm as an additional browser host usually just adds:

- another runtime boundary
- more glue code
- harder debugging
- no meaningful simplification over TS

So for browser/Wasm:

- Rust core + TS host: good
- Rust core + Zig host: not worth it
- Rust core + Go host: not worth it

### Likely Rust stack

Best current foundation:

- `wgpu`
- `wasm-bindgen`
- optional `winit` or native shell later

`Vello` is promising, but should be treated as an optional accelerator, not the foundation the whole bet depends on.

### Risks

- higher prototype cost than imperative Pixi
- Rust verbosity / LLM ergonomics may slow iteration
- browser text editing still wants an overlay story

### Current recommendation level

Best long-term browser architecture if the team is comfortable with Rust.

## Option 4: Browser/Electron-web scene renderer + hidden input bridge, but no visible DOM workspace

### Verdict

This is the realistic "almost no DOM" browser target.

### What it means

- no DOM-rendered rows/sections/controls in the workspace
- all visuals painted by the scene
- hidden or tiny input bridge used only for browser text input semantics
- scene paints caret, selection, text, and row chrome

### Why this matters

This is likely the cleanest browser-compatible answer to:

- "we don't want DOM in the workspace"
- "we still need robust text input"

### Current recommendation level

Strongly recommended as the strictest practical browser target.

## Option 5: use Zed / GPUI / Zed-like editor stack in the browser via Wasm/Electron-web

### Verdict

Not recommended for the current browser/Electron-web direction.

### Why

Zed is not a browser-ready embeddable editor component.

Current official signals:

- Zed repo lists `Web` as a tracking issue, not a shipped target
- GPUI is pre-1.0 and still actively changing
- Zed itself is GPL
- GPUI is Apache 2.0

### Practical conclusion

Do not plan around "using Zed instead of CodeMirror" in the current browser-style Setta app.

### When it becomes interesting

Only if Setta becomes a native desktop app written in Rust.

## Option 6: native desktop rewrite in Rust using GPUI / Zed-like ideas

### Verdict

Serious future option, not the fastest proof path.

### What it means

- abandon browser-first workspace architecture
- likely move away from DOM-based editor overlays entirely
- use GPUI or a custom Rust native UI/rendering stack
- possibly reuse ideas from Zed's editor architecture

### Why this is attractive

- closest conceptual path to a truly native-feeling app
- no browser input constraints in the same way
- Zed/GPUI becomes materially more relevant here

### Why it is not the current recommended next move

- much larger rewrite
- Rust-heavy
- higher build/integration cost
- less likely to produce the fastest proof

## Option 7: Zig custom engine

### Verdict

Most interesting non-Rust custom-engine alternative.

### Why it is attractive

- simpler language than Rust
- likely more LLM-friendly than Rust
- good fit for a custom renderer mindset

### Why it is not the default recommendation

- browser/Wasm UI ecosystem is thin
- editor/tooling stack is much weaker than browser JS host + DOM overlay editors
- more custom work required

### Best use of Zig

If the team refuses Rust but still wants a custom engine, Zig is the first language to evaluate.

### Current recommendation level

Good alternative to Rust for a custom scene engine, but riskier from ecosystem and velocity standpoints.

## Option 8: Flutter / Skia (`CanvasKit` / `skwasm`)

### Verdict

Best full-framework non-JS alternative.

### Why it is attractive

- full retained rendering stack
- serious platform support
- less low-level than custom Zig/Rust engine work

### Why it is not the default recommendation

- bigger framework bet
- larger rewrite
- not the fastest path to a prototype inside the current app

### When it becomes attractive

If the team decides that a full product-stack rewrite is acceptable and wants a non-DOM retained-rendering framework instead of a custom engine.

## Option 9: Go

### Verdict

Readable language, weak fit for this specific problem.

### Why

What is good:

- easy to read
- good LLM ergonomics
- Wasm support has improved

What is weak:

- browser graphics/UI ecosystem for this kind of app is not strong
- Gio calls WebAssembly experimental
- Ebitengine is more game/2D-engine oriented than dense editor/workspace oriented

### Current recommendation level

Not recommended as the primary workspace rewrite language.

## Option 10: C++ + Emscripten

### Verdict

Technically serious, strategically unattractive.

### Why

- mature low-level toolchain
- real path to Wasm/browser GPU work

But:

- higher complexity
- worse ergonomics than Zig
- not a cleaner path than Rust for this problem

### Current recommendation level

Only worth revisiting if the team already wants a native/C++ engine path.

## Option 11: off-the-shelf workspace/rendering libraries

### Libraries specifically considered

- React Flow
- tldraw
- Excalidraw
- Konva
- Fabric

### Verdict

Do not choose these as the primary next architecture.

### Why

- React Flow remains in the DOM optimization lane already explored locally
- tldraw is a strong infinite-canvas SDK, but still a DOM-rendered "DOM canvas" system with culling; this is a weak fit for the "most content visible at once" hotspot
- Excalidraw is shape-centric, not parameter-widget-centric
- Konva/Fabric are respectable, but neither is a stronger fit than Pixi or a custom scene engine for this specific workspace problem

## Editor options

## Browser/Electron-web

### CodeMirror 6

Best default lightweight browser editor option.

Pros:

- modular
- lighter than Monaco
- good for overlays

Cons:

- still DOM-backed
- still needs overlay projection if the workspace is scene-owned

### Monaco

Best broad-capability browser editor option.

Pros:

- richer IDE-like behavior
- broad language support
- easiest answer if "any language" matters more than editor footprint

Cons:

- heavier
- still DOM-backed

### Zed

Not a browser-ready answer for the current app.

## Native desktop

If Setta becomes native desktop:

- Zed/GPUI-like editor stack becomes much more relevant
- using a Zed-like code editing approach for code sections becomes plausible
- still do not use a full code editor for every tiny text field

Recommended split even in native:

- lightweight text inputs for simple fields
- serious editor only for code/multiline sections

## Recommended option ordering

If the next conversation needs a clear ordering, use this:

1. React/TS shell + imperative Pixi scene + DOM overlay editors
   - fastest serious proof
2. Rust/Wasm scene core + React/TS host + DOM overlay editors
   - strongest long-term browser architecture
3. Browser/Electron-web scene renderer + hidden input bridge, but no visible DOM workspace
   - likely the cleanest strict browser target
4. Native Rust/GPUI/Zed-like rewrite
   - serious, but large and slower to prove
5. Zig custom engine
   - best non-Rust custom-engine candidate
6. Flutter / Skia rewrite
   - best full-framework alternative
7. Go
   - not recommended

## Current recommendation

If the goal is a fast, credible proof:

- stay browser-first for the prototype
- use one scene-owned workspace
- keep the app shell in React/TS
- use imperative Pixi first
- use scene-authored geometry for overlays from the start
- allow no visible DOM in the workspace
- allow a hidden/minimal DOM input bridge if needed
- use CodeMirror 6 or Monaco only as active overlay editors

This path should first recreate:

- a standard `Callable` section
- a standard `Dict` section

The prototype must prove:

- pan/zoom quality
- text quality
- first-click editing
- bounded DOM
- stable visual identity

## Explicit prototype priorities

The current user preference is:

- do not waste time trying to make the full test suite green right now
- get a clean prototype up and running quickly
- use comments / notes for missing tests if necessary
- bias toward proof artifacts over broad verification work

For the prototype, the main artifacts should be:

- benchmark results
- traces
- DOM counts
- screen recordings
- editor activation latency
- visual comparisons on `Callable` and `Dict`

## Kill criteria

The next serious attempt should stop and pivot if any of these remain red after a bounded effort:

1. The canary still needs DOM section shells or DOM row shells to look acceptable at rest.
2. First-click editing still depends on hidden-anchor authority instead of scene-owned visible hit geometry.
3. Dense resting DOM does not fall dramatically from the current `~9.5k` node baseline.
4. Zoom text is still obviously blurry, snapping, or unstable.
5. The best win still comes mainly from hiding DOM during motion while DOM remains the true resting owner.

## What a future assistant should not reopen casually

Do not reopen these as default answers without genuinely new evidence:

- broad DOM-first optimization as the main plan
- hybrid DOM/canvas workspace ownership
- another many-canvas composition experiment
- tldraw as the main renderer
- Excalidraw as the main renderer
- Go as the primary workspace rewrite language
- Zed as the browser editor replacement

## Local references

- [frontend-performance-branches-retrospective.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/docs/notes/performance/frontend-performance-branches-retrospective.md)
- [2026-04-22_scene-renderer-strategy-review.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/docs/notes/performance/2026-04-22_scene-renderer-strategy-review.md)
- [2026-03-07_settings-all-settings-pan-zoom-benchmark.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-03-07_settings-all-settings-pan-zoom-benchmark.md)
- [2026-04-18_settings-all-settings-go-rewrite-baseline.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md)
- [2026-04-18_settings-all-settings-retained-canvas-dense-rerun.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-18_settings-all-settings-retained-canvas-dense-rerun.md)
- [2026-04-20_settings-all-settings-retained-graph-attribution-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-20_settings-all-settings-retained-graph-attribution-report.md)
- [2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md)
- [2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md](/home/ubuntu/dev/setta.go-rewrite-pixi-scene/perf/reports/frontend/2026-04-21_settings-all-settings-chat-pane-activator-geometry-replan-report.md)

## External references

### Browser / Wasm

- MDN WebAssembly overview: https://developer.mozilla.org/en-US/docs/WebAssembly
- MDN WebAssembly JS API guide: https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API
- `wasm-bindgen` guide: https://rustwasm.github.io/docs/wasm-bindgen/
- Bytecode Alliance component model docs: https://component-model.bytecodealliance.org/
- `wit-bindgen`: https://github.com/bytecodealliance/wit-bindgen
- `jco`: https://github.com/bytecodealliance/jco

### Rendering stacks

- Pixi text docs: https://pixijs.com/8.x/guides/components/scene-objects/text
- Pixi bitmap text docs: https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap
- `@pixi/react` docs: https://react.pixijs.io/getting-started/
- React Flow performance guide: https://reactflow.dev/learn/advanced-use/performance
- tldraw visibility/rendering: https://tldraw.dev/sdk-features/visibility
- `wgpu`: https://wgpu.rs/
- Vello: https://github.com/linebender/vello

### Alternative languages / frameworks

- Flutter web renderers: https://docs.flutter.dev/platform-integration/web/renderers
- Zig overview: https://ziglang.org/learn/overview/
- Zig docs: https://ziglang.org/documentation/master/
- zig-gamedev: https://github.com/zig-gamedev/zig-gamedev
- Gio: https://github.com/gioui/gio
- Emscripten: https://github.com/emscripten-core/emscripten

### Zed / GPUI

- Zed repo: https://github.com/zed-industries/zed
- GPUI README: https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md
- Zed open-source post: https://zed.dev/blog/zed-is-now-open-source

