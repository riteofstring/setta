# OpenUI Artifact Phase 4 Audit - 2026-07-26

## Result

Phase 4 is complete. The Director artifact rail and browser now preserve one
validated artifact identity through lazy preview reads, neighbour prefetch,
cache reuse, and full rendering; mixed documents traverse the persistent modal
without stale content, background focus, graph remounts, or an adjacent full
document. Every available Phase 4 deterministic and live-provider gate is
green.

Phase 5 did not start.

## Scope

The requested minimum range was
`63aed824b04e5625be3adb165fcf637bced5ee3c..f1f2fcaefede03a565ab71852595724cedad55ef`,
plus this audit's fixes. History inspection found that the loop did not restart
through another Phase 4-only commit, but the coherent review expanded to the
two Phase 4 renderer-cutover deliverables forced into
`4200d5a1e9ebeffe98c45a611e6ef418456b6f1d`: the generic
`SettaArtifactRenderer` and removal of the artifact-kind rail switch.
`f1f2fcaef` then landed the preview gallery, browser, cache, and official
Dialog, Scroll Area, and Tooltip sources as one change.

Before verification, one static pass inspected:

- the plan, phase boundary, commit history, Phase 0 through Phase 3 audit
  evidence, and every Phase 4 recording that postdated or immediately preceded
  the implementation commit
- the generated artifact contract and decoders, Go compiler invariants, HTTP,
  main, preload, IPC, Director projection, rail ordering, and full read identity
- the bounded projection for every catalog component, parser/chunk boundary,
  cache and in-flight lifecycle, viewport observation, retained browser state,
  neighbour prefetch, and runtime reset
- every full artifact adapter, safe Markdown/link/file behavior, tables,
  charts, mixed layout, error telemetry, and the render boundary
- Dialog composition, focus containment and restoration, accessible names,
  disabled control tooltips, touch targets, arrow-key ownership, live
  announcements, reduced motion, responsive layout, light/dark appearance, and
  mounted graph behavior
- the deterministic Director workflow, fake provider, required workflow
  manifest, live-provider matrix, and recorded performance environment failures

Repository searches found no artifact-kind renderer branch, old in-rail detail
panel, selected-card expansion state, artifact Zustand store, eager OpenUI or
Recharts import in the command-center chunk, unbounded preview, remote-content
path, or compatibility layer.

The Phase 2-3 broad and live evidence predates `f1f2fcaef`. Two focused Director
recordings immediately before that commit were green, but covered only one
generated-image preview and a `1 of 1` open/close path. They were useful
implementation evidence, not the Phase 4 gate, so fresh broad verification was
required.

## Audit Corrections

The audit fixed the following current-phase issues:

- Moved Director/full-payload identity enforcement into
  `ArtifactDocumentCache`. Initial reads, shared in-flight reads, cache hits, and
  prefetched neighbours now all require ID, conversation, turn/run, title, and
  creation time to agree before an entry can be cached or rendered. Identity
  faults are reported with the other impossible post-acceptance faults.
- Added one internal retry around the idempotent artifact read. Deterministic
  identity and parse failures are not retried, and the terminal reader-facing
  message no longer asks the user to retry an internal failure.
- Keyed local document state to both artifact and runtime cache, made an
  immediate cache hit authoritative, and remounted the inner scroll/document
  subtree on navigation. A persistent Dialog can no longer show the prior
  document under the next artifact's title or carry tab, accordion, or scroll
  state between artifacts.
- Added a browser-scoped render error boundary so a chunk or component failure
  becomes generic artifact failure UI plus renderer telemetry rather than an
  application failure.
- Made the complete preview card height invariant by truncating its title,
  preserved full title text in the DOM, enlarged the artifact icon controls to
  40 by 40 pixels, and kept disabled controls hover-describable through a
  noninteractive Tooltip anchor.
- Put the rail projection on the active appearance's semantic card surface.
  Light mode no longer applies dark text directly over the command center's
  intentionally dark rail. The full browser and preview both use the existing
  Setta theme tokens; no artifact theme or raw replacement palette was added.
- Made chart previews display their projected label and plot negative bars,
  lines, and areas around a real zero baseline.
- Made browser Left and Right Arrow navigation stand down for every native or
  custom focusable control, table scroller, and Scroll Area viewport rather
  than only a short control list.
- Applied native `inert` and `aria-hidden` to the mounted command-center content
  while the artifact browser is open, matching the existing history-overlay
  contract. Base UI's modal focus guards remain authoritative inside the
  portal, while the graph stays mounted and background focus is impossible.
- Expanded the required production Electron workflow from one artifact to
  three. It now covers stable preview height, single-click behavior, explicit
  and double-click opening, light and dark appearance, unique-document
  traversal, both boundaries, button and keyboard navigation, live
  announcements, one active full document, table arrow ownership, mixed
  content, a new artifact arriving while browsing, focus containment and
  restoration, graph identity, and restart durability.

## Color Review

### Findings

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | `desktop/src/renderer/src/features/director-command-center/director-command-center.css:472` | Transparent preview viewport over the hardcoded dark rail while content used the active `--foreground` | `background: var(--card)` with the existing foreground, muted-foreground, border, and card tokens | Light appearance could put dark text directly over dark rail chrome. Foreground-on-card and muted-foreground-on-card are Go-owned semantic pairs validated to WCAG AA in both appearances. |

### Verification and Verdict

The production Electron workflow selected light and dark through the real
settings UI and observed a nontransparent preview surface and Dialog surface
with distinct computed foreground and background colors in both modes. Static
inspection confirmed that the affected text/background pairs are among the
Go-owned appearance contrast checks and that no new raw color was introduced.

Verdict: Approve.

## Focused Verification

The changed cache and preview paths passed with 27 focused tests, alongside
focused lint and the renderer typecheck. After the cache-bound test was added,
its four retry, in-flight identity, prefetched identity, and eviction cases
passed again.

The first broad run exposed the missing native `inert` behavior through the
strong background-focus assertion. After the shell fix, the exact production
workflow passed:

```sh
node desktop/tests/electron/director-command-center-workflow.test.mjs --skip-build
```

Artifact:
`.recordings/director-command-center/20260727T062349628Z/`.

## Broad Deterministic Matrix

The initial combined invocation was:

```sh
env -u OPENAI_API_KEY ./scripts/test_topic_conversation_workflows.sh
```

Its production build, four Go packages, and all 77 desktop test files with 684
tests passed. The Director Electron workflow then exposed the missing shell
`inert` behavior. The command continued through the live matrix, whose results
are recorded below.

After the narrow Director workflow was green, one final applicable broad
deterministic invocation passed:

```sh
env -u OPENAI_API_KEY \
  ./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

It passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 77 desktop test files and 684 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

The production build kept the preview projection and full artifact renderer in
separate lazy chunks. The initial renderer chunk was 926.43 kB, the projection
chunk was 8.02 kB, and `SettaArtifactRenderer` was 1,012.49 kB.

Final deterministic artifacts:

- `.recordings/director-command-center/20260727T062504562Z/`
- `.recordings/director-command-center-local-voice/20260727T062520241Z/`
- `.recordings/microphone-permissions/20260727T062531973Z/`

## Live Provider Matrix

Local Codex ChatGPT auth was already available. The initial combined command
excluded `OPENAI_API_KEY` and ran the complete live matrix once:

- agent protocol: passed
- active-side isolation: passed
- topic-conversation workflow, controls/restart, and artifact publication:
  passed
- Director command center: passed

The live Go suites were not rerun after the renderer-only native-`inert` fix;
their green results already postdated every provider, backend, and contract
change.

## Phase Boundary

Every available Phase 4 gate is satisfied. The
`director-command-center-performance` workflow remains an accurately recorded
release gate: its graph-pixel assertion failed identically on the pinned
pre-change revision in this environment, so it was not retried. No missing
credential, privilege, GUI application, background service, or remote access
was sought. Phase 5 remains pending and was not started.
