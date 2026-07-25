# Setta 4 Mockup Fidelity Checklist

Date: 2026-07-24

## Scope

This closes item 6 of Phase 0 in
`docs/plans/setta-4-director-command-center-plan.md`: it converts the approved
fullscreen mockup into a checklist that separates required production UX from
prototype-only fake data, dev controls, and demo scripts.

The reviewed artifact is `docs/mockups/fullscreen_conversation_concept.html`,
committed at `d6edd2a96`, git blob `345590098c39d9f8e9959e168cf7559e7477b3ef`,
sha256 `73eed7c7593fd5df7b692fa562371daa8bcfc5eeaf6bc1e2a3f75fe074577559`,
1,377 lines. The plan records that it was copied from the frozen
`setta-3-fullscreen-conversation` branch at
`5d7c56780fc069979651cc2446f6d6b79c77a4fe`.

Line references below point into that mockup file.

### How to use this checklist

- **Section 1 is binding.** Every row is production UX that the Phase 4
  side-by-side review checks against the mockup.
- **Section 2 must not ship.** These are prototype scaffolding, fake data, and
  dev affordances.
- **Section 3 is the gate between them.** A section 1 visual may ship only when
  a typed Setta source owns its meaning. Where no owner exists today, the row
  names the Phase 1 contract that must create one.
- **Section 5 is the complete list of allowed differences** as of this date. A
  new difference requires a plan amendment, not a note in an implementation
  commit.

This checklist describes the mockup's *user-visible* behavior. Its
implementation details — the demo scheduler, seeded generators, and dev
toggles — are inventory, not contracts.

## 1. Required production UX

### 1.1 Fullscreen composition and chrome

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Full-canvas surface | One `<canvas>` at `100vw`/`100vh` on `#05060a`; everything else floats over it (lines 7–9, 170) | The graph canvas is the primary surface; chrome overlays it and never reflows it into a pane or column |
| Top bar | Fixed 44 px, gradient fade to transparent, left navigation group and right view group (lines 38–50, 174–187) | Compact top workstream navigation with the same weight; it must not grow into a tab strip or toolbar |
| Left "Now" rail | Fixed 300 px, `top: 44px`, `bottom: 92px`, `pointer-events: none` with interactive children only (lines 51–53, 189–194) | Left rail shows current activity for the selected workstream and never blocks graph interaction |
| Right "Artifacts" rail | Fixed 300 px, scrollable, masked fade at both ends (lines 82–84, 198–201) | Right rail lists produced outputs, newest reachable without hunting |
| Bottom composer | Centered column: hint line above a 620 px max pill input with an `⏎` chip (lines 108–116, 211–217) | One Director composer owns text and voice submission for the selected workstream |
| Floating label layer | Full-viewport, `z-index: 8`, pointer-transparent, between canvas and rails (lines 55, 196) | Graph labels are DOM over the canvas, under the rails, and never intercept graph pointer input except on the outcome pill |
| History overlay | Centered modal, backdrop, user messages plus final responses only (lines 148–156, 203–209) | Compact user/final-answer history is one keystroke or one click away and stays free of intermediate activity |
| Rail/composer visibility | Top chips toggle `hide-summaries`, `hide-artifacts`, `hide-composer` (lines 85, 182–184) | View toggles are allowed and are view state; they must not change durable records |
| Palette | Dark OKLCH token set: `--bg`, `--surface`, `--panel`, `--fg`, `--muted`, `--faint`, `--border`, `--primary`, `--accent-green`, `--accent-red`, `--accent-teal` (lines 32–37) | The Setta 4 appearance tokens replace the pane palette with this dark, luminous hierarchy |

### 1.2 Central graph visual language

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Turn ladder | Each turn is input node → reasoning graph → outcome node; reasoning rows compress into a tight user/outcome ladder once the answer settles (`layout()`, lines 930–966) | Completed turns compact into a readable ladder; the outcome node stays visible when its detail folds |
| Re-expansion | Clicking the outcome node pins a turn open or closed; a stray graph click folds nothing (lines 1004–1015) | Expansion is explicit, reversible, and pure view state |
| Branching | Fan lanes run in parallel off one tip and rejoin at a merge node (lines 339–351) | Parallel real work branches and rejoins with the same spatial reading |
| Dead ends | A branch that stops dims, keeps its glyph, and its edge terminates (lines 337–338, 368–372) | Failed or abandoned work stays visible as a terminated path, not erased |
| Node body | Particle cluster with a core and orbiters, a glyph in the centre, sized by recency plus a "working" envelope (`nodeCssDiam`, line 1016; `PT_VS`) | Nodes read as living clusters whose size and energy track recency and activity |
| Edges | Curved segmented beams that grow from parent to child, modulated by confidence (`EDGE_VS`, `updateSceneBuffers`, line 968) | Edges are drawn from typed relationships and animate along real causality |
| Mode palette | cyan think, violet do, amber risk, green success, red fail, pale merge/synthesis, pale-blue listening (lines 269–271) | The same seven-way color language, driven by typed kind and status |
| Background field | Drifting particle medium with halftone dither, CRT barrel (`BARREL = 0.21`, line 273), scanlines, vignette, and static grain (`POST_FS`, lines 666–690) | The dark, luminous, slightly analog field is part of the product identity, not a demo filter |
| Camera | Follows the live edge; the wheel scrolls back and detaches; the live edge keeps tracking while detached (lines 1048–1059, 1138) | Look-back never stops live work and never requires hunting for a "return to live" control |
| Fit frame | Layout is authored in an 800×1024 portrait reference frame and letterboxed, capped at `MAX_FIT = 1.1` (lines 278–286) | Graph shape and on-screen node scale stay stable across window sizes instead of stretching |
| Switch transition | Rails fade out, dots dim, a signal tear plus chromatic aberration plays during the swap (lines 163–165, 671–676) | Workstream switching has a deliberate transition; the outgoing workstream keeps its own progress |

### 1.3 Floating node labels

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Auto-fade | Labels show at birth then fade to icon-only as the flow passes (`FADE_SPAN = 0.42`, lines 901–903) | Text density decays with distance from the live edge |
| Hover peek | Hovering a node restores its label to full opacity (lines 1025–1032) | A pointer-free equivalent is required; see section 5 |
| Sticky question | The active turn's user pill sticks to `STICKY_TOP = 58` px while its turn is open (lines 915, 922) | The question driving current work stays on screen |
| Outcome pill | `✓` over the node on success, `✗` below it on failure so the eclipsed node stays visible; click expands the full text (lines 68–81, 925) | Outcome summaries are legible at a glance and expand in place |
| Warp alignment | Labels and reticles use the same barrel constant as the shader so they stay attached (`warpToScreen`, lines 1018–1020) | Overlay geometry stays locked to node geometry at every viewport |
| Bounded text | Labels are `nowrap` with ellipsis and a `max-width` of 260–320 px (lines 56–73) | Canvas-adjacent text stays bounded; full text lives in DOM detail surfaces |

### 1.4 "Now" rail

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Item list | Ordered list, mode-colored dot, short line plus expandable detail (lines 87–95, 1297–1305) | Current activity reads top-down with the same compactness |
| Emphasis | Newest item is expanded and bright; items older than the last two drop to 0.4 opacity (lines 90–94) | Recency is visible without reading timestamps |
| Expansion | Clicking an item toggles its fuller detail (line 1345) | Detail on demand, not a wall of text |
| Thread history | "see thread history ›" opens the history overlay (lines 96–98, 190, 1352) | The compact transcript is reachable from the rail |
| Summary | A collapsed "Summary" disclosure holds the longer-form narrative (lines 120–126, 1358) | Longer public summaries are available but never the default reading surface |

### 1.5 "Artifacts" rail

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Card shape | Kicker, title, meta, optional typed body, 12 px radius panel (lines 100–107, 1306–1310) | Artifacts are typed cards, not chat text |
| Typed bodies | `bars`, `diff`, and `rows` previews with tabular numerals and add/delete coloring (lines 128–134, 1288–1292) | Artifact previews are rendered from typed payloads, not formatted strings |
| Arrival | 420 ms `art-in` entrance on a new card (lines 101–102) | New artifacts announce themselves without stealing focus |
| Expansion | Clicking a card opens the full content on its own surface (lines 1322–1330) | Rich detail opens in an accessible DOM/native surface |

### 1.6 Workstream navigation and background work

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Selected title | Centered title with `‹`/`›` buttons, 190 px min width (lines 42–44, 176–179) | One selected workstream, always named |
| Status dots | One dot per workstream: selected (`on`), active (teal pulse), complete (dim green) (lines 45–47, 157–161, 1280–1286) | Background workstreams expose actionable aggregate state only |
| Windowing | Beyond 24 workstreams the strip windows to 19 dots plus an `i/N` counter (lines 1284–1286) | The strip stays bounded as workstream count grows |
| Background progress | Every workstream advances whether or not it is selected; switching resumes it, never restarts it (lines 1268–1279, 1048–1049) | Background workstreams keep running and keep their state across selection changes |

### 1.7 Input and interaction

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| Composer submit | `Enter` submits, appends a new turn, and jumps the camera to it (lines 1334–1343) | Submission is one keystroke and the view goes to the work it started |
| Director hint | A pulsing teal dot plus a short "on: …" line above the input (lines 109–110, 212) | The Director's current commitment is visible above the composer |
| Placeholder | "Ask the director…" plus the navigation hint (line 214) | The composer states what it does and how to move between workstreams |
| Keyboard | `←`/`→` switch workstreams and require a modifier while typing; `Escape` closes the overlay (lines 1355, 1361–1363) | Navigation and dismissal are keyboard-first and never fight the text field |
| Pointer | Hover peeks a label, click selects a node, click on an outcome node folds/unfolds, wheel looks back (lines 999–1015, 1138) | The graph is directly manipulable without a mode switch |
| Selection reticle | Corner-bracket reticles mark the active node and the selected node (lines 23–29, 171–172) | Selection and current activity are separately visible |

### 1.8 Responsive behavior

| Item | Mockup behavior | Production requirement |
| --- | --- | --- |
| ≤ 760 px | Both rails hide, the Summaries/Artifacts chips hide, the title narrows to 120 px (line 166) | The phone-sized viewport keeps graph, top navigation, and composer; it never adopts the pane model |
| Fit scaling | The letterboxed reference frame keeps node size constant instead of ballooning on large displays (lines 278–286) | 4K and 6K viewports show more context, not larger nodes |

## 2. Prototype-only — must not ship

| Prototype element | Where | Why it is not production |
| --- | --- | --- |
| Dev bar and every toggle: collapse mode, label mode, dither pattern, cell size, particle mode, field style, thread count, parallel columns, grid count, scanline, listen, speed, restart, FPS readout | lines 185, 219–252, 985–996, 1369–1371 | Dev controls, not product affordances. The FPS/GPU readout belongs to the performance harness |
| `BASE_CONVS`, `EXTRA_TITLES`, `buildConvList`, `mkConv` seeded demo conversations | lines 1143–1250 | Fake conversations, artifacts, summaries, and history |
| Background demo scheduler: per-conversation `gT` clocks, `tickConversations`, loop-and-restart, idle-then-new-work | lines 1268–1279 | Fabricated progress. Production advances only on committed events |
| `RUN` canned reasoning script, `fan`/`dead` lane specs, `laneOffsets` | lines 287–301, 337–352, 309 | Scripted sample activity. Branching must come from durable delegations and forks |
| `listen` checkbox and its `u_listen` simulation | lines 248, 994 | Fake capture state. Listening visuals bind to real capture |
| `iconFor()` keyword matching on label text (`/bash|execute|run|…/`) | lines 764–773 | The plan forbids semantics inferred from text keywords. Glyphs come from typed kind and status |
| `struggle` mode and the `struggling` name | lines 269–271 | The plan forbids a generic `struggling` node; see section 5 |
| Multi-column (`buildMulti`) and parallel-grid (`buildParallel`) views | lines 380–420 | Layout exploration. Background workstreams are represented by the dot strip, not by tiled graphs |
| `mulberry32` seeded generation of demo scene size | lines 266, 864–871 | Deterministic contract fixtures replace it; particle jitter stays a render detail only |
| `#err` shader-error dump | lines 30, 253 | Raw implementation errors must not reach the user |
| `data:text/html` artifact tab | lines 1322–1330 | Placeholder for a real artifact surface |
| `#response-legacy-unused` styles | lines 136–146 | Dead prototype CSS |
| Demo history seeding and the `history.push` on submit | lines 1152, 1336 | History is durable event data |

## 3. Typed-state requirement for every visual mode

Every visual in section 1 must be backed by a typed Setta fact. "Exists" means
a durable owner is already present per
`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`. Otherwise the row
names the Phase 1 work that must create the owner.

| Visual | Required typed source | Status |
| --- | --- | --- |
| Listening node and mic glyph | Capture state (view) plus `user_input_accepted` (durable) | Exists; capture state stays view state |
| User question pill | `user_input_accepted` public text | Exists |
| Cyan "think" energy | Active run plus `public_reasoning_summary_updated` | Exists. Private reasoning deltas are forbidden as evidence |
| Violet "do" nodes | `activity_started/progressed/completed`, `file_change_proposed/completed` | Exists; typed activity kind selects the glyph |
| Amber risk state | `approval_requested`, blocked/retry/recovery lifecycle, validation failure, resource waits | Approvals exist; **durable resource-request records are missing** (inventory gap 1) — Phase 1 items 4–5 |
| Branch/fan lanes | `subagent_started/updated/completed`, side conversations, forks | Exists |
| Merge/synthesis node | `plan_changed`, delegation joins, Director interpretation with provenance | Plan steps have no ids (inventory gap 3); interpretation metadata is Phase 1 item 4 |
| Outcome `✓`/`✗` pill | `turn_completed`, `turn_failed`, `turn_interrupted` | Exists |
| Dead-end branch | `activity_failed`, `turn_interrupted` | Exists |
| Artifact cards and typed bodies | `artifact_emitted` plus artifact records | Exists; typed preview payloads are Phase 1 item 4 |
| "Now" rail items | Milestone-class nodes and public summaries carrying source event ids | Needs the node/evidence contract — Phase 1 items 4 and 6 |
| Summary disclosure | Durable public summary from the narration path | Exists |
| History overlay | `user_input_accepted` plus `agent_message_completed` | Exists |
| Title, `‹`/`›`, dots, `i/N` counter | App-scoped workstream registry: ordering, selection, aggregate status | **Missing** (inventory gap 2) — Phase 1 item 7, Phase 3 item 4 |
| Director hint line | Validated Director route decision | Exists as Master route decisions; needs workstream language — Phase 3 items 1–2 |
| Node glyph, color, shape, and animation | Exhaustive mapping over kind × evidence class × status | New — Phase 1 items 6 and 13 (gallery built from production fixtures) |
| Live arrival of any of the above | App-scoped pushed subscription with a durable cursor and `resync_required` | New — Phase 1 item 7 |

## 4. View-state boundary

The following are view state in the mockup and must stay view state in
production. None may write back into semantic graph truth:

camera position and detachment, node selection, hover, turn fold/unfold and its
manual pin, label opacity and stickiness, rail/composer visibility chips,
history overlay open state, quality tier and render scale.

Conversely, folding a turn, switching workstreams, or hiding a rail must not
suppress, drop, or reorder durable events.

## 5. Allowed differences from the mockup

These are the complete, declared divergences as of this date.

1. **Glyphs come from typed kind and status**, not from keyword matching on
   label text (`iconFor`). Required by the plan's hard line against keyword
   inference and by the exhaustive visual catalog.
2. **No `struggling` state.** The amber visual survives and maps to typed
   `approval_required`, `resource_required`, `blocked`, `retry`, `recovery`, or
   `validation` with a failure status. Nothing in production is labelled
   "struggling".
3. **Timing follows real events.** The fixed dwell interval, the looping clock,
   and the scripted branch density are gone. Motion may decorate the wait
   between committed events; it may not imply a step that did not happen.
4. **Quality clamps come from the performance matrix**, not from the
   prototype's fixed constants (device-pixel-ratio clamp 1.5, 2.3 MP scene
   ceiling, 3.6 MP post ceiling). See
   `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`;
   Phase 2 confirms or replaces them by measurement.
5. **Accessibility adds affordances the mockup lacks**: a reduced-motion path
   for the barrel/scanline/tear/pulse effects, focus management and a focus trap
   for the history overlay, keyboard equivalents for the hover label peek and
   the outcome-node click, and live-region announcements for approvals and
   arrivals. The mockup's `--faint` token on `--bg` does not meet normal-text
   contrast, so production raises it wherever it carries body-level text rather
   than decoration.
6. **Artifact expansion opens a real artifact surface** with provenance and
   controls, not a generated `data:` URL tab.
7. **Real text is longer than mock text.** Bounded wrapping replaces
   single-line ellipsis where a real public summary needs two lines; the label
   budget stays bounded.
8. **The phone layout must still reach Now and Artifacts.** The mockup simply
   hides both rails below 760 px; production needs an accessible disclosure for
   unresolved approvals, resource requests, and artifacts at that width, because
   those are actionable state rather than decoration.

Anything not on this list is a fidelity defect, not a design choice.

## 6. Phase 4 review procedure

The Phase 4 exit gate is a side-by-side review, run at the viewports defined in
the performance matrix:

1. Load the committed mockup and the production shell at each reviewed viewport.
2. Capture a screenshot pair per viewport and a short recording pair covering
   active work, branching, failure, recovery, completion, and a workstream
   switch.
3. Walk section 1 row by row and mark match, differs-with-reason (the reason
   must already be in section 5), or defect.
4. Walk section 2 and confirm none of it is present in the production build.
5. Record the result as a report under `docs/reports/` with the build revision,
   viewport, device pixel ratio, and artifact paths.

**Release gate.** This review needs the built app and the mockup driven on a
real display. It cannot be produced from repository edits and is already
recorded as a release gate in
`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`, section 5.
