# OpenUI Artifact Cutover - Post-Change Performance

Date: 2026-07-26

## Scope

This is the append-only post-change performance record required by Phase 5 of
`docs/plans/openui-artifact-system-plan.md`, covering the replacement of Setta's
four fixed artifact kinds with one validated OpenUI document rendered through
official shadcn/ui Base UI source.

It records every post-change row the repository itself can produce:

- renderer bundle and lazy-chunk composition, measured against the plan's two
  pinned pre-change revisions
- dependency impact of the cutover
- parse, preview-projection, preview-render, and full-document-render duration
  for the representative document and for the catalog's maximum source, table,
  and node-count boundaries
- rendered element counts for the same documents, plus the DOM a hidden tab or
  closed accordion section costs
- backend acceptance cost, which is what stands between a model's output and a
  stored artifact

The rows that need a driven Electron session are named in "Release Gate" and are
not estimated here.

## Environment

Recorded from the machine that produced these measurements, per section 1 of
`setta-4-target-performance-matrix-20260724.md`.

| Field | Value |
| --- | --- |
| Machine | MacBook Pro, Apple M1 Pro, 8 CPU cores |
| Memory | 32 GB |
| OS | macOS 26.5.2, build 25F84, arm64 |
| Node | 25.2.1 |
| pnpm | 10.23.0 |
| Go | 1.26.5, darwin/arm64 |
| Vite | 7.3.5 |
| Vitest | 4.1.7 |

No tier from section 3 of the matrix applies: nothing in this report renders to
a display. These are build-output sizes and single-process CPU measurements, so
viewport and device-pixel ratio do not enter them. The viewport-dependent rows
are the ones deferred to the release gate below.

## Production Change Made For This Report

Measuring the bundle exposed one regression and it was corrected here rather
than recorded as acceptable.

The artifact browser overlay was statically imported by
`DirectorCommandCenterShell`, so the Dialog and Scroll Area primitives it alone
consumes were paid for on first paint by every reader, including those who never
open an artifact. `ArtifactBrowserOverlaySlot` now holds the chunk boundary and
the overlay loads when a reader opens an artifact. Measured directly in an
otherwise identical tree, that moved 105.82 kB out of the initial
command-center chunk, from 926.43 kB to 820.61 kB. The final figure below is
820.85 kB because the same commit also split the Now rail out of the shell.

The rail's Tooltip stays in the initial chunk on purpose: the expand control on
every preview card needs it, and the plan requires that control to have one.

## 1. Renderer Bundle

Both pre-change revisions are the ones the plan pins, and all three builds ran
`electron-vite build` on this machine.

| Chunk | `fd9d6fb21` pre-Base UI | `3ed68d293` pre-artifact | Now | Loads when |
| --- | ---: | ---: | ---: | --- |
| `index` (command center) | 537.89 kB | 571.04 kB | 820.85 kB | First paint |
| `index` CSS | 91.41 kB | 141.90 kB | 154.54 kB | First paint |
| `DirectorGraphSurface` | 715.61 kB | 716.29 kB | 716.34 kB | Graph mounts |
| `artifact-preview-projection` | — | — | 8.02 kB | A preview enters the rail viewport |
| `artifact-catalog` | — | — | 290.16 kB | With either artifact path |
| `ArtifactBrowserOverlay` | — | — | 110.42 kB | A reader opens an artifact |
| `SettaArtifactRenderer` | — | — | 1,012.56 kB | A reader opens an artifact |

Reading the deltas:

- Phase 1's official Base UI primitives cost +33.15 kB of JavaScript and
  +50.49 kB of CSS, replacing Setta's own Button, Badge, and Input.
- Phases 2 through 4 cost +249.81 kB of JavaScript and +12.64 kB of CSS in the
  initial chunk. That is the always-visible preview gallery: the preview cards,
  the bounded preview surface, the document cache, and the Base UI Tooltip and
  floating machinery behind the expand control.
- Everything else the cutover added — the OpenUI parser, the generated catalog,
  Recharts, the catalog's components, and the browser overlay — is behind a lazy
  boundary. 1,421.16 kB of artifact code loads on demand, against 249.81 kB
  carried up front.

The plan's bundle rule holds. The initial chunk statically imports no other
emitted chunk, and a search of the built output finds Recharts only in
`SettaArtifactRenderer`: the command center, the preview projection, the
generated catalog, and the overlay chunk all contain zero Recharts tokens.

## 2. Dependency Impact

Direct dependencies added by the cutover, all exact and all added through
`./update_dependencies.sh`:

| Package | Version | Reaches |
| --- | --- | --- |
| `@base-ui/react` | 1.6.0 | Initial chunk and both artifact chunks |
| `@openuidev/react-lang` | 0.2.8 | Lazy artifact chunks only |
| `zod` | 4.4.3 | Lazy artifact chunks only |
| `recharts` | 3.8.0 | `SettaArtifactRenderer` only |
| `tw-animate-css` | 1.4.0 | CSS only |

`@openuidev/lang-core` `0.2.9` is resolved and integrity-pinned transitively in
`desktop/pnpm-lock.yaml`. No manifest or lockfile entry names a shadcn CLI
package, `@openuidev/react-ui`, or any `@radix-ui/*` package, and no direct
dependency in `desktop/package.json` carries a floating range.

## 3. Document Pipeline Cost

`vitest bench`, mean milliseconds per operation. "Project preview" is the rail's
whole cost for one artifact it has read, so it includes the parse. "Render
document" is what opening an artifact does: `Renderer` takes source text rather
than a tree, so the overlay parses again rather than reading again.

| Document | Source | Parse | Project preview | Render preview | Render document |
| --- | ---: | ---: | ---: | ---: | ---: |
| Representative mixed report | 951 B | 0.0306 | 0.0344 | 0.0125 | 0.9116 |
| 64 KiB maximum source | 65,536 B | 0.8129 | 0.8102 | 0.0133 | 1.6205 |
| Maximum table | 11,539 B | 0.3583 | 0.3710 | 0.0453 | 6.9951 |
| Maximum statements and nodes | 8,082 B | 0.3608 | 0.3886 | 0.0099 | 3.1355 |

The parse figures reproduce Phase 0's: 0.0306 ms against 0.0298 ms for the
representative document, and 0.8129 ms against 0.8123 ms for the 64 KiB maximum.
The pinned parser did not get slower across the cutover.

What this says about the two read paths:

- A rail preview costs under 0.05 ms for a representative artifact and under
  0.86 ms for the largest document the catalog admits, projection and render
  together. Eight previews of maximum-size documents cost under 7 ms of CPU in
  total, and they are read lazily as they enter the viewport rather than all at
  once.
- Opening an artifact costs 0.91 ms for a representative document and 6.99 ms
  for a maximum table. The maximum table is the worst case the catalog allows
  and it is a single non-repeating cost per open, held by the document cache for
  a repeat open of the same artifact.

## 4. Rendered DOM

Elements produced by one server render, which is the DOM the overlay mounts and
the DOM a preview card mounts.

| Document | Full document | Rail preview |
| --- | ---: | ---: |
| Representative mixed report | 65 | 4 |
| 64 KiB maximum source | 27 | 5 |
| Maximum table | 1,321 | 20 |
| Maximum statements and nodes | 258 | 3 |

The preview projection's own limits, not the document's, are what bound the
right column: a preview draws at most five blocks whatever the document holds,
so the largest document in the corpus produces the second-smallest preview.

Two bounds are now held by tests rather than only by inspection:

- A table at the catalog's maximum renders exactly one `table` element, 101 rows,
  12 header cells, and 1,200 body cells — one DOM row per model row, with no
  sticky-header clone or measurement copy.
- A hidden tab panel and a closed accordion section mount neither a chart nor a
  table. Base UI unmounts a hidden panel by default, so an unopened section costs
  nothing beyond its trigger.

## 5. Backend Acceptance

`go test -bench`, the cost of compiling a document before it can be stored.

| Document | Time | Throughput | Allocations |
| --- | ---: | ---: | ---: |
| Representative | 0.038 ms | 24.97 MB/s | 464 |
| 64 KiB maximum source | 0.501 ms | 130.90 MB/s | 128 |

Acceptance is roughly a third of the cost of one renderer parse of the same
source, so validating before persistence is not what bounds the artifact path.

## Commands

```sh
pnpm -C desktop exec electron-vite build

pnpm -C desktop exec vitest bench --run \
  src/renderer/src/features/artifacts/artifact-document-pipeline.bench.tsx

pnpm -C desktop exec vitest run \
  src/renderer/src/features/artifacts \
  src/renderer/src/features/director-command-center

./scripts/go.sh test ./internal/conversation/artifactdoc \
  -run '^$' \
  -bench '^BenchmarkCompile' \
  -benchtime=1s \
  -benchmem

node desktop/tests/electron/director-command-center-workflow.test.mjs
```

The Director command-center Electron workflow was rerun after the overlay chunk
boundary moved, because that boundary is what opens the artifact browser. It
passed, including focus containment, focus restoration to the expand control,
traversal across both collection boundaries, and the mounted graph behind the
Dialog. Artifact:
`.recordings/director-command-center/20260727T064103912Z/`.

## Release Gate

The following rows need a driven Electron session on the primary target display
and cannot be produced by this repository. They are recorded once here as a
release gate, not estimated:

- the pre-change baseline itself: command-center initial load, artifact rail open
  and close latency, and pre-cutover markdown, table, chart, and file artifact
  detail latency, captured against `fd9d6fb21` for bundle-load figures and
  `3ed68d293` for artifact-surface figures
- lazy chunk load latency
- time until visible artifact previews are ready
- first and repeat artifact open latency
- artifact browser open and close latency
- previous and next transition latency with cold and prefetched neighbours
- preview DOM counts and artifact-read counts with 100 artifact metadata entries
  in a live rail
- scroll performance through eight mixed-content preview cards
- memory after repeatedly opening and closing artifacts
- command-center frame behaviour while an artifact is open

`director-command-center-performance` remains unavailable in this sandbox for an
unrelated reason already recorded in the Phase 4 audit: its blank-graph-canvas
assertion fails identically on the pinned pre-change revision, so the WebGL pixel
readback here, not the artifact cutover, is what stops it.

No credential, privilege, GUI application, background service, or remote access
was sought for any of the above.
