# Fullscreen adaptive thread grid — 2026-07-30

## Scope

Measure the Director grid before and after making its columns respond to the
actual graph viewport and reducing high-count workstreams to one activity node.
The fixture is the development graph simulator at 100 threads in a disposable
Electron profile.

## Baseline

- Viewport: 1920 × 1080 CSS pixels at device scale factor 1.
- Sampling: 120 requested animation frames after the 100-thread projection
  settled.
- Visible column titles: 101.
- Visible title/title intersections: 994.
- Horizontal span between the leftmost and rightmost title centers: 639.64 px,
  or 33.31% of the viewport.
- Document descendants: 234.
- Average frame rate: 60.00 fps.
- p95 / p99 frame delta: 17.70 ms / 17.70 ms.
- Maximum frame delta: 17.80 ms.
- Long tasks: 0.

The fixed 1.45-world-unit grid width is the limiting factor. The portrait
reference frame letterboxes that width into the middle third of a landscape
window, while the 72 px minimum label budget is wider than the resulting
59 px title pitch.

## After

- Viewport and sampling: the same 1920 × 1080 CSS pixels and 120 requested
  animation frames after the 100-thread projection settled.
- High-density representation: the Director's 4-node, 3-edge trajectory plus
  100 worker activity nodes, down from 304 trail nodes and 203 edges in the old
  100-thread fixture.
- Grid shape: one full-height Director centre spine between two 7-column ×
  8-row worker flanks.
- Horizontal span between the outermost worker cell centers: 1,698.46 px, or
  88.46% of the viewport.
- Visible graph text overlays in the sampled idle frame: the Director title
  only. Dense mode adds at most one hovered worker title and one node label.
- Visible label/title intersections: 0.
- Document descendants: 117.
- Document overflow: 0 px on both axes.
- Average frame rate: 60.00 fps.
- p50 / p95 / p99 frame delta: 16.70 ms / 17.60 ms / 17.70 ms.
- Maximum frame delta: 17.70 ms.
- Long tasks: 0.

The viewport now determines each flank's aspect ratio and cell pitch. Up to six
worker threads retain short trails; higher counts reduce each worker to its
current activity node while the Director keeps its full trajectory in the
centre. Text width is bounded by cell pitch, dense grids expose only contextual
worker text, and off-screen worker titles leave with their tiles instead of
stacking against a viewport edge.

A manual 390 × 800 CSS-pixel pass covered both sides of the level-of-detail
boundary: six threads retained their trails in balanced flanks, while nine and
100 threads used worker activity nodes around the aligned Director spine. The
compact simulator trigger, Director title, worker titles, and node labels had
zero intersections. The 100-thread wide view also retained zero intersections
and no runtime error overlay.

## Follow-up: readable density, stable resize, and 120 Hz budget

The first adaptive-grid pass still compressed too many activity nodes into each
row, hid most thread titles, and budgeted adaptive quality against the current
display refresh. The occasional hitch was therefore independent of node count:
the fixed fullscreen field and post passes could miss an 8.33 ms ProMotion
frame even with the six-node standalone fixture.

### Standalone renderer before

Environment: disposable Electron renderer, Apple M2 through ANGLE Metal,
1280 × 820 CSS pixels at DPR 2, full tier and render scale 1. The sustained
fixture ran for 12 seconds.

| Metric                                |                        Before |
| ------------------------------------- | ----------------------------: |
| Frames on the 60 Hz profiling display |                           714 |
| CPU p50 / p95 / p99 / max             |  0.20 / 0.30 / 0.50 / 2.40 ms |
| GPU p50 / p95 / p99 / max             | 1.67 / 6.13 / 9.81 / 12.98 ms |
| Long tasks                            |                             0 |

GPU p99 and maximum both exceeded the 8.33 ms 120 Hz budget. The quality
controller also derived its target from the profiling display, allowing a
60 Hz monitor to hide this miss.

### Standalone renderer after

The renderer now always adapts against 8.33 ms, retains a quality reduction for
the lifetime of the surface instead of periodically reallocating upward, pools
GPU timer queries, skips settled DOM-label work on ambient-only frames, and
caps the full-tier scene pass at 2.0 megapixels.

| Metric                      |                          After |
| --------------------------- | -----------------------------: |
| Duration / frames           |                  12.05 s / 714 |
| Adaptation budget           |                        8.33 ms |
| CPU p50 / p95 / p99 / max   |   0.20 / 0.50 / 0.80 / 3.30 ms |
| GPU p50 / p95 / p99 / max   |   1.67 / 5.17 / 6.77 / 7.46 ms |
| Long tasks                  |                              0 |
| Render scale / tier changes |                        1.0 / 0 |
| Scene surface               | 1766 × 1131 (1,997,346 pixels) |
| Post surface                |                    1920 × 1230 |
| Pixel check                 |                         Passed |

The profiling display is physically 60 Hz, so it cannot demonstrate 120
presented frames per second. It does demonstrate that both measured renderer
paths now remain below the 8.33 ms 120 Hz deadline at p99 and at the observed
maximum on this hardware.

### Production-shell 100-thread sample

With the simulator panel closed, an eight-second sample produced 479 presented
frames (59.875 fps on the 60 Hz display). Frame delta p50 / p95 / p99 / max was
16.70 / 17.60 / 17.70 / 17.80 ms, with zero frames above 20 ms and zero long
tasks. The shell contained 155 DOM elements while showing 29 on-screen thread
titles.

At 1280 × 820, the visible worker-title span was 1,142 CSS pixels, from x=71 to
x=1213, while the Director remained centred. All 29 visible titles had zero
pairwise intersections. Six workers retained short trails; nine and higher
used one activity node per worker. A compact 400 × 800 pass showed nine visible
titles within a 96 px per-column text budget and also recorded zero title
intersections.

### Resize continuity

A live 100-thread surface was resized from 1280 × 820 to 1100 × 760 and back
after its entrance motion settled. The label layer recorded four expected style
updates for new positions and width budgets, but its reveal opacity stayed at
the settled value throughout. No layout reveal or node entrance restarted, and
the console remained free of warnings and errors. Viewport changes now replace
only viewport-authored coordinates, preserve the simulation clock, fold state,
hover state, and ambient field clock, and snap the camera to the reflowed live
edge.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Correction: fixed fluid fidelity and grid-only chrome

The retained runtime reduction described in the preceding follow-up was not an
acceptable final state. Although it avoided repeatedly stepping quality back
up, any live tier or render-scale change still altered the fluid field's
halftone sampling and could resize render targets during animation. The
renderer now uses one fixed full-fidelity profile for the life of the canvas.
This section supersedes the adaptive-quality behavior above while preserving
the earlier measurements as investigation history.

### Controlled quality-transition reproduction

Environment: disposable Electron renderer, Apple M2 through ANGLE Metal,
1200 × 942 CSS pixels at DPR 2. A controlled eight-millisecond pressure input
was used for five seconds to exercise the exact former quality-controller path;
it establishes the cost and visual mechanism of a transition, not its natural
frequency in ordinary use. Temporary fetch instrumentation recorded each
transition and was removed after the diagnosis.

The former controller moved from full quality at render scale 1.0 to reduced
quality at render scale 0.4. Its scene surface changed from 1596 × 1252 to
428 × 336 and its post surface from 1800 × 1413 to 1382 × 1085. Each quality
step was immediately followed by a surface resize, and the tier transition also
rebuilt geometry buffers. The five-second sample contained 284 frames, one
50 ms frame, and a 4.9 ms maximum measured CPU render cost. The surface and
sampling changes explain the observed brighter/fuller versus duller/thinner
halftone pixels.

### Fixed-quality renderer after

The same five-second sample after removing runtime fidelity changes retained
the full profile, the 1596 × 1252 scene surface, and the 1800 × 1413 post
surface throughout.

| Metric                                |                    Fixed quality |
| ------------------------------------- | -------------------------------: |
| Frames on the 60 Hz profiling display |                              298 |
| CPU p50 / p95 / p99 / max             |     0.10 / 0.40 / 0.60 / 3.00 ms |
| GPU p50 / p95 / p99 / max             |     1.75 / 4.44 / 7.13 / 7.69 ms |
| Frame-delta p50 / p95 / p99 / max     | 16.70 / 17.60 / 17.70 / 17.70 ms |
| Frames at or above 50 ms              |                                0 |
| Long tasks                            |                                0 |
| Quality or surface transitions        |                                0 |
| Pixel check                           |                           Passed |

GPU p99 remained below the 8.33 ms rendering deadline for 120 Hz on this
hardware. The physical display was 60 Hz, so this is renderer-budget evidence,
not a claim of 120 presented frames per second.

Performance sampling is now explicit and harness-only. In the production shell
it does not allocate GPU timer queries, run a long-task observer, or take
per-frame CPU timestamps unless a profiling session opts in.

### Production-shell and grid presentation check

A five-second, 64-thread production-shell sample recorded 300 frames on the
60 Hz display. Frame-delta p50 / p95 / p99 / max was
16.70 / 17.00 / 17.50 / 17.60 ms, with zero frames above 20 ms, zero frames at
or above 50 ms, and zero long tasks. An instrumented WebGL context counted zero
GPU timer-query starts, confirming that performance sampling remained dormant.

Grid presentation now omits the sticky Now and Artifacts rails and their
visibility controls. The Director remains centered with worker threads flanking
it. A manual 64-thread check found neither rail in the document; switching to a
four-thread column presentation restored both rails and controls. The browser
console remained free of warnings and errors.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: 64-thread transition and viewport-stable field density

The settled-frame samples above did not cover the interaction that replaces the
live graph with the 64-thread development fixture. A new trace measured that
transition in a disposable visible Electron window at 1280 × 820 CSS pixels,
DPR 2, on the same 60 Hz profiling display.

### Transition baseline

- Interaction to next paint: 101 ms.
- Input delay / processing / presentation: 0.3 / 42 / 59 ms.
- Synchronous click dispatch: 40.833 ms.
- Minor garbage collection inside the click update: 4.823 ms.
- Directly constructing and packing the 64-thread fixture in isolation:
  1.2–2.6 ms over eight samples.

The fixture was not the long pole. Its state update ran at urgent input
priority and synchronously rendered the whole command-center shell.

### Transition after

The simulator now marks graph-composition swaps as interruptible React
transitions. The pressed control can paint immediately while React prepares the
new graph between frames.

- Interaction to next paint: 56 ms.
- Input delay / processing / presentation: 1 / 2 / 53 ms.
- Click dispatch: 0.600 ms.
- 1.8-second animation sample: 108 frames.
- Frame-delta p50 / p95 / p99 / max:
  16.7 / 17.7 / 17.8 / 17.8 ms.
- Frames over 20 ms: 0.
- Frames at or above 50 ms: 0.

The display is physically 60 Hz, so this establishes an uninterrupted presented
frame sequence on that display, not 120 presented frames per second. The urgent
main-thread interaction work is now 2 ms, below an 8.33 ms 120 Hz budget.

### Density and colour

The field keeps one 5,200-particle allocation and the same deterministic seed.
An 800 × 800 viewport remains the exact density reference. Smaller windows draw
a deterministic area-proportional prefix (for example, 2,600 particles at
400 × 800), while larger windows retain the full buffer, concentrate its
density around the 800 px central volume, and smoothly thin and dim the outer
particles. Resizing changes a draw count and uniforms only; it does not
reallocate, reseed, or restart the field.

The fixed post exposure moved from 1.70 to 1.82. Node and edge colour receives
a 1.12 chroma boost with an explicit display-gamut clamp. These are fixed shader
constants, so the brighter colour does not fluctuate with quality or viewport
state.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: subpixel DOM/WebGL scroll unification

The graph's DOM labels previously rounded every projected canvas coordinate to
an integer and wrote it through `left` and `top`. Slow camera movement therefore
made the text advance in visible one-pixel steps while WebGL continued at
fractional coordinates. Those writes also put layout work on the camera frame.

Labels and thread titles now keep `left` and `top` fixed at zero and apply the
exact projected coordinate through the compositor's individual `translate`
property. The existing `transform` remains responsible only for anchoring and
the title reveal motion, so the reveal transition never delays scroll tracking.

The same disposable 1280 × 820 Electron renderer, DPR 2, 64-thread grid, and
60 Hz display was traced before and after. Metrics below cover only the wheel
interaction window and are normalized by its duration where the input cadence
differed.

| Main-thread work          | Rounded `left`/`top` | Composited `translate` |
| ------------------------- | -------------------: | ---------------------: |
| Layout events             |                  107 |                      1 |
| Layout time per second    |             2.601 ms |               0.061 ms |
| Commit time per second    |             6.532 ms |               3.817 ms |
| Pre-paint time per second |             4.531 ms |               3.378 ms |
| Maximum commit            |             2.205 ms |               0.155 ms |

A post-change 300-frame slow-scroll sample had a
16.7 / 17.7 / 17.9 / 18.3 ms frame-delta p50 / p95 / p99 / maximum, with no
frame above 20 ms. Every sampled Director-title position retained a fractional
coordinate. A longer 1,200-frame continuous-scroll sample had a 20.6 ms maximum,
two frames above 20 ms, and no frame above 32 ms or 50 ms. No console warnings
or errors were recorded.

The physical display was 60 Hz, so these samples establish smooth presentation
at the available refresh rate and removal of the main-thread layout defect. They
do not claim 120 presented frames per second. The fixed rendering profile and
its separate GPU-budget evidence remain documented above.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Correction: dense-grid rail access

The earlier grid check recorded Now and Artifacts as unavailable. That is no
longer the intended product behavior. Dense grids, including the 100-thread
presentation, keep both disclosure controls in the stable top bar while
starting with both rails closed so the graph retains the full viewport.

Opening Now or Artifacts floats one bounded rail over its corresponding side;
opening the other replaces it. Escape closes the rail and restores focus to the
trigger. Leaving the grid restores the normal flanking-rail visibility rather
than carrying the temporary grid disclosure state into a conversation view.

A manual 100-thread Electron check confirmed both controls, both rail contents,
mutual exclusion, Escape dismissal and focus restoration, and an unobstructed
default graph at 1280 × 820. Emulated 600 × 800 and 400 × 800 passes kept the
floating rail inside the viewport and preserved the graph and composer beneath
it. The development simulator trigger remains clear of the trailing Artifacts
rail. No console warnings or errors were recorded.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: long-running graph histories — 2026-08-01

The development graph simulator now varies source-history depth independently
from side-thread count. The available node counts are 3, 4, 6, 9, 16, 64 and
100, and the selected count is applied exactly to the Director and to every
simulated side thread. The panel reports both source and rendered counts so
production compaction remains visible rather than being hidden by the fixture.

The baseline used the disposable 1280 × 820 Electron renderer at DPR 2. The
existing fixed four-node fixture with 100 side threads produced 404 source nodes
and 104 rendered nodes. Three switches from live data took 50.9, 51.1 and
50.4 ms (50.8 ms mean).

After the change, switching an already selected scale from four to 100 nodes
produced these results:

| Side threads | Source nodes | Rendered nodes | Switch samples      |  Median |    Mean |
| -----------: | -----------: | -------------: | ------------------- | ------: | ------: |
|            3 |          400 |            400 | 33.3, 33.6, 33.8 ms | 33.6 ms | 33.6 ms |
|          100 |       10,100 |            200 | 66.3, 67.4, 83.0 ms | 67.4 ms | 72.2 ms |

The 3-thread case preserves all 100-node histories in the full-trail column
layout. The 100-thread case intentionally exercises the largest generated
history while the production grid projection compacts side threads to activity
dots and keeps the Director spine, limiting the renderer to 200 nodes. No
console warnings or errors were recorded.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: progressive simulation and bounded grid scroll — 2026-08-01

The long-history simulator previously opened after its final scheduled event,
so every generated thread looked complete on its first frame. It now starts at
event time zero. Worker cadences vary deterministically, causing 100-node side
threads to finish between 29.6 and 42.8 seconds while the Director advances on
its own 35.6-second schedule. A live 3-thread × 100-node sample exposed changing
Director and worker checkpoint labels from the first 500 ms onward.

Grid camera bounds are now presentation-specific. At the oldest bound, the
first grid row projects to clip `+0.9` near the viewport top rather than clip
`-0.9` near its bottom; the live edge remains the opposite scroll bound.
Repeated wheel input at each end produced identical title positions. The
Director title remained pinned at 64 CSS pixels while all worker titles kept
their DOM identity and natural translated position, including positions beyond
the clipped graph surface.

The barrel post-process previously used mirrored texture wrapping because its
corner mapping sampled 5.25% beyond each source edge. The map is now normalized
to the source extent, transient chromatic and glitch offsets attenuate at the
boundary, and the texture uses clamp wrapping. The matching DOM and glyph
inverse was updated at the same time, so labels remain attached without a
reflected copy of the particle field.

The earlier 64-thread 300-frame scroll baseline was
16.7 / 17.7 / 17.9 / 18.3 ms p50 / p95 / p99 / maximum. After retaining all 65
grid titles and applying the new bounds and warp, the same 1280 × 820 Electron
renderer at DPR 2 recorded 16.7 / 17.5 / 17.6 / 17.7 ms across 300 continuously
scrolled frames. No frame exceeded 20 ms and no long task was recorded.

The dev-only 100-thread × 100-node selector now retains 101 titles. Switching
from four to 100 nodes took 100.2, 82.4 and 82.7 ms (82.7 ms median, 88.4 ms
mean), compared with the earlier 66.3, 67.4 and 83.0 ms sample (67.4 ms median,
72.2 ms mean). This one-time fixture construction is outside the scroll loop;
the production projection still compacts 10,100 source nodes to 200 rendered
nodes. Startup and interactive passes recorded no renderer warning, WebGL
shader error or console error.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Correction: Director-owned camera and a bounded side grid — 2026-08-01

The preceding progressive-simulation section interpreted the requested sticky
behavior too literally. It is superseded by this correction. Director history
still scrolls normally; the side grid remains present with clearance from the
top chrome and composer. A short grid fits wholly inside that lane. A tall grid
scrolls as one coherent group until its top or bottom reaches the corresponding
stop, so its rows can pass out of view without the entire grid leaving.

Before the correction, a 100-thread grid at one camera extreme projected its
worker titles roughly 7,700–8,040 CSS pixels above the viewport. The camera's
live edge was derived from the deepest node in every column, then the Director
column was selectively shifted to follow it. New worker depth could therefore
move the shared camera. In addition, the Director's grid row spacing depended
on its current node count, so appending a Director node re-spaced the existing
history.

The grid now derives camera bounds from column zero, the Director, and uses a
viewport-derived Director row scale that is independent of current node count.
Worker rows retain their relative geometry and receive one shared,
camera-relative world offset. This keeps the Director timeline immutable while
giving the side grid the two-sided sticky behavior of a bounded document
region.

A manual 1280 × 820 Electron pass at DPR 2 used 100 side threads with 16-node
histories. At both the oldest and live camera bounds, 24 complete worker titles
remained in the safe lane. Their complete-title bounds were 122.25–600.08 CSS
pixels at the oldest edge and 131.65–609.87 pixels at the live edge. The worker
group itself moved about 239 pixels between those extremes, confirming that the
grid scrolls rather than pinning each row.

The development simulator now advances the Director and every side thread on
four staggered phases. Dense grids show each thread's current activity while
small grids retain a short trail. A live tile was observed changing from a plan
checkpoint in Thinking state to a later action checkpoint in Working state
without moving its grid position. Playback rates are 0, 0.1, 0.25, 0.5, 1 and
2×; 0 pauses the simulation and the default is 0.25× so long-running work can
be observed at a realistic pace. The full 10,100-node scenario is constructed
only when its selected scale changes, while progressive frames remain compacted
to 200 rendered nodes.

The earlier 100-thread × 100-node selector baseline was 82.4, 82.7 and 100.2 ms
(82.7 ms median). After scenario reuse, three warm switches measured 33.3,
32.8 and 33.3 ms (33.3 ms median); a cold switch measured 66.6 ms. A 600-frame
continuous random-scroll sample on the active 100 × 100 simulation recorded
16.7 / 17.4 / 17.7 / 32.4 ms p50 / p95 / p99 / maximum, with one frame above
20 ms, none above 50 ms and no long task. The current renderer session recorded
no console warning, error or WebGL shader error.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: shared column origin and persistent live follow — 2026-08-01

The columns presentation previously moved every shorter conversation downward
until its final node aligned with the deepest column. In the 4-thread × 6-node
simulation, current label positions spanned about 60.55 CSS pixels even though
the packed columns all authored the same zero origin. This made independent
threads appear to start at arbitrary heights. End alignment has been removed;
the first input of all five columns now resolves to world Y `0`, while the
camera still derives its target from the deepest currently visible fact across
the columns.

The live camera already had an easing function and wheel detach/reattach rules,
but content clamping recomputed detachment from distance to the live edge. On
the first 60 Hz easing frame toward world Y `1`, the camera advanced to
`0.03667`; clamping then marked it detached, and the next follow request was
ignored at the same position. Clamping now preserves attached follow state.
Only an intentional wheel look-back detaches, while reaching the live bound
reattaches.

An instrumented production-renderer pass observed a wheel look-back move the
camera from `0.2565` to `-0.3935` and detach it. The next 120 follow attempts
were correctly ignored. Scrolling to the live edge moved it to `0.8`,
reattached it, and 164 subsequent frames continued easing with zero cases where
an attached camera was detached by clamping.

The same 1280 × 820 Electron renderer at DPR 2 recorded 479 continuous frames
while the 4 × 6 simulation advanced at 2× and the camera detached and
reattached. Frame deltas were 16.7 / 17.6 / 18.3 / 18.6 ms p50 / p95 / p99 /
maximum, with no frame above 20 ms and no long task.

The macOS title-bar pass was checked alongside the camera change. The logo's
leading edge moved from 80 to 96 CSS pixels, and the no-drag shield shrank from
the full 1280-pixel bar to the 96-pixel native traffic-light region. Empty bar
space and the static workstream title now resolve to drag targets; buttons and
the workstream strip remain no-drag. At 600- and 400-pixel window widths the
brand/control groups did not overlap and unused title-bar space remained
draggable. The production window-drag path moved the Electron window by the
requested 16 × 8 CSS pixels and restored it to its original position.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: interruptible overview motion and recency trails — 2026-08-01

Every progressive Director-overview frame was a replacement snapshot. The
semantic reduction changed a side thread's local recency slots, while the grid
immediately recomputed its shared bounded offset. In a 6-thread × 6-node run at
1280 × 820, the `Voice capture` tile and its attached title moved 87.564 CSS
pixels in one painted frame when the short trail grew. The shader was not slow;
the target geometry itself was being swapped.

Overview snapshots now retarget for 260 ms from the state that is actually on
screen. Durable node IDs preserve continuing facts; the newest recency slot per
workstream preserves a stable origin when the latest fact itself is replaced.
The captured camera is included in that state, so a simultaneous live-edge
clamp cannot move the old frame underneath the transition. Motion uses an
interruptible smoothstep and uploads its exact completion frame before the
scheduler sleeps. The same reproduction reduced the largest per-frame title
movement to 9.063 CSS pixels over 16 frames. A complete three-node simulator
cycle, including its synthetic restart, stayed below 9.893 pixels per frame.

The bounded overview level of detail now applies consistently to both wide
columns and the viewport grid. With 3–6 side threads, the Director keeps its
full opaque spine while every side thread keeps at most three nodes with
newest-to-oldest opacity `1`, `0.32`, and `0.1024`. Above six side threads, each
side thread remains one fully opaque activity node. In a 9-thread check all
nine stable tiles changed durable node ID and visual mode/glyph as work
advanced, none changed title position, and the Director retained all six of
its simulated nodes.

Before this pass, a stable 6 × 6 simulation at 2× recorded 240 frames with
0.3 / 0.6 / 0.8 / 1.5 ms CPU p50 / p95 / p99 / maximum, 2.373 / 5.427 /
8.063 / 11.330 ms GPU, and 16.7 / 17.6 / 17.7 / 17.8 ms frame deltas. After
the transition and opacity projection, the same production renderer recorded
242 frames with 0.5 / 0.8 / 1.2 / 3.3 ms CPU, 2.846 / 6.624 / 8.797 /
12.006 ms GPU, and 16.7 / 17.6 / 17.7 / 17.9 ms frame deltas. Both samples had
zero long tasks and zero frames above the renderer's dropped-frame threshold.

No automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: bounded column scrolling and independent playback time — 2026-08-01

The columns presentation used one shared camera but projected every column at
its authored world position. That made all columns move together only while
their content happened to overlap the viewport: once the longest thread kept
scrolling, a shorter thread's top or bottom could leave the canvas entirely.
The supporting grid already had a two-sided bounded document offset, but it was
applied once to the whole grid and not to side-by-side columns.

The bounded offset is now a presentation-neutral projection primitive. In the
columns presentation it is evaluated independently for each supporting thread,
while column zero remains the unmodified Director spine. The shared camera
range continues to come from the outermost content across every column, so a
side thread follows it until one of its edges reaches the safe lane between the
heading row and composer, then pins only that thread while the longest thread
continues. Columns retain their complete visible trajectories; recency
reduction is now grid-only. The grid still evaluates one shared side-document
offset so its rows cannot shear apart. Its bounded three-node recency trails
and the Director's unrestricted spine are unchanged.

An edge-clamp probe used a 1440 × 900 viewport and a short world interval from
`0` to `0.6`. The old authored projection placed that interval at
`2857.5–3127.5px` and −1642.5 to −1372.5px at the two camera extremes. The new
projection pins it to `454–724px` at the lower stop and `112–382px` at the
upper stop; at the in-range camera position it remains unshifted at
`382.5–652.5px`.

The development simulator also used its playback-scaled virtual clock as the
shader animation clock. This changed particle, birth, and settle animation
speed along with event cadence. It now keeps a piecewise event-to-animation
timeline: the slider changes when future facts arrive, while animation time
always advances at one wall-clock second per second. Past node timestamps stay
fixed across speed changes, pausing adds no future events while existing motion
finishes, and resuming schedules only future timestamps after the pause. The
Director simulation now advances by visible prefixes rather than relying on
future nodes hidden by a scaled shader clock, so it retains all visible history
without leaking future facts during a pause.

The immediately preceding production-renderer baseline was 16.7 / 17.6 / 17.7
/ 17.9 ms frame-delta p50 / p95 / p99 / maximum with no long task and no frame
above the dropped-frame threshold. The connected browser-control surface was
unavailable for another interactive production capture. A warmed code-level
comparison modeled the actual largest columns presentation — four supporting
columns plus Director with 100 nodes in each column. Across nine
100,000-projection samples, the median shared-offset pass took
`0.000572ms` and the independently bounded pass `0.002430ms`, an added
`0.001857ms` per projection. This remains far below one percent of a 16.7 ms
frame budget.

Targeted regression cases were added for both scroll stops, shared movement
between them, piecewise playback timing, pause/resume continuity, and
progressive Director history. They were not run, and no automated test suite
or verification gate was run during implementation, in accordance with the
repository policy.

## Follow-up: invariant graph geometry and elastic Director edges — 2026-08-03

The viewport contain-fit was also the node-size and ladder-spacing multiplier.
As a result, resizing changed the visual language rather than only the amount
of visible context. Before this pass, a base node and one row interval measured
`10.725px / 49.92px` at 390 × 844, `21.098px / 98.2px` at 1512 × 982, and
`24.2px / 112.64px` at 3840 × 2160. The reference projection now cancels the
CSS viewport dimensions directly and leaves its size multiplier at one. The
same node and interval are `22px / 102.4px` at all three sizes. Responsive
packing can still change how many thread regions fit in a row, but it no longer
zooms nodes, glyphs, or edge intervals. The grid packer also had an independent
height-derived multiplier that stretched the Director's row indices to fill
the viewport; that scaling contract and the renderer's node-size uniform were
removed, so the Director now retains its authored row geometry in every
presentation.

Wheel input now keeps the semantic camera clamped to the real top and live-edge
bounds while a separate visual camera stretches by at most 52 CSS pixels. A
resisted input hold feeds a slightly under-critical spring, which returns once
and settles without changing detached/follow state. Reduced-motion mode clears
the displacement immediately. DOM labels, title anchors, pointer projection,
culling, field, edges, nodes, and glyphs all read the same visual camera during
the return, so the elastic frame cannot pull interactive overlays away from the
graph.

The optional fluid response is a Director-only development preview. It reuses
the existing particle template, node-state texture, and node buffers; no
particles, buffers, React state, or per-frame objects are added. With the
option off, the node pass remains one draw call and sends a zero wake uniform.
While a wake is active in an overview, the already-contiguous Director range is
drawn with the wake scalar and the remaining side nodes are drawn normally, for
at most one temporary extra draw call. Only non-core Director particles move;
node bodies, glyphs, edges, and every side thread stay anchored. The scalar
decays to zero and lets the frame scheduler sleep again.

The pre-change clamped-camera microbenchmark recorded a median
`0.000002210ms` per step across nine one-million-step samples. A second warmed,
same-process probe isolated the incremental elastic branch: the
legacy-equivalent clamp measured `0.000005817ms` per step, the new effect-off
path `0.000006290ms`, and a mixed boundary workload with one outward wheel
event per 24 spring frames `0.000008692ms`. The disabled-path increment was
`0.000000473ms` (about 0.47 nanoseconds) per wheel event; an active spring step
remained about 8.7 nanoseconds on this code-level probe.

The Electron main, preload, and renderer development builds completed and the
updated renderer hot-reloaded without a compile or shader error. The connected
browser-control surface was unavailable, so no new interactive GPU/frame-time
capture was claimed. Focused regression cases were added for invariant fit,
bounded elastic return, reduced motion, and the non-core shader gate. They were
not run, and no automated test suite or verification gate was run during
implementation, in accordance with the repository policy.

## Follow-up: Director-owned supporting-thread stops — 2026-08-03

The supporting-thread projection still treated fixed viewport insets as its
sticky edges: 112 CSS pixels below the viewport top and 176 pixels above its
bottom at 1440 × 900. That kept side content visible, but its stopping points
did not move with the Director trajectory it was meant to support. This
supersedes the safe-lane boundary described in the earlier bounded-column
follow-up.

Every overview now derives its semantic camera from the Director column. The
supporting projection receives the Director's actual top and live-edge world
positions plus those camera bounds. At the oldest camera position, a side
thread aligns its top node with the Director's top node. A short thread sticks
to that Director anchor until its bottom can take over, then follows the
Director's bottom through the live edge. A side document taller than the
Director scrolls coherently between the same two anchors over the available
camera range. The grid still applies one shared offset to all side rows, while
the columns presentation evaluates the same rule independently per thread.

There are no viewport chrome or composer constants in the projection anymore.
At 1440 × 900, the grid's Director top resolves to 45 CSS pixels at its oldest
camera bound and its bottom to 665.04 pixels at live; supporting content now
uses those exact positions instead of 112 and 724 pixels. In the columns
presentation the existing loose history framing places the Director top at
855 pixels at its oldest bound, and supporting tops follow that position too
rather than silently switching back to a viewport margin.

A warmed same-process probe modeled Director plus four supporting columns with
100 nodes each over nine 100,000-projection samples. The previous
viewport-bound pass measured `0.000393264ms` per projection and the
Director-bound pass `0.000426339ms`, an added `0.000033075ms` (about 33
nanoseconds) for the complete 500-node projection. Both remain below the
broader `0.002430ms` independently bounded baseline recorded previously and
far below one percent of a 16.7 ms frame budget. The new helper allocates
nothing on the frame path.

The Electron main, preload, and renderer development builds completed and the
updated renderer started without a compile error. Focused regression cases were
replaced with Director-top, sticky transition, Director-bottom, and tall-side-
document coverage. They were not run, and no automated test suite or
verification gate was run during implementation, in accordance with the
repository policy.

## Correction: directional sticky release and stronger elastic return — 2026-08-03

The Director-owned follow-up above still derived a supporting thread's offset
only from the current camera position. That made the same camera position
choose the same place regardless of which edge the user had just left, so an
edge could not release, travel with the Director, and become sticky again at
the opposite edge. This section supersedes that position-only transition.

The projection now carries the previous world offset as view state. Reversing
away from a sticky edge keeps that offset unchanged, which means the supporting
thread moves one-for-one with the Director. The offset changes only when the
thread's opposite edge reaches the Director's top or live-edge screen anchor.
Columns retain one offset per thread; a grid retains one shared offset so its
tiles cannot shear apart. Same-overview snapshot replacements preserve those
offsets, so a simulated or real node arrival cannot reset the directional
behavior in the middle of a scroll. A new overview starts top-aligned, and both
overview presentations now use the Director's bounded-document camera frame;
the loose single-conversation history frame no longer leaks into columns.

The elastic response is also deliberately more legible. Maximum visual travel
increased from 52 to 76 CSS pixels, input transfer from 0.18 to 0.26, and the
gesture hold from 50 to 60 ms. The return spring changed from 180 / 24 to
150 / 20 stiffness/damping, producing a softer single return rather than more
oscillation. A 600-pixel boundary gesture reaches 73.535 pixels, settles in 89
frames at 120 Hz (0.742 seconds including the hold), and crosses the rest point
once by only 0.428 pixels. Reduced motion still clears the displacement
immediately. The opt-in Director fluid wake uses the same existing scalar and
draw split; the stronger feel adds no particles, buffers, React updates, or
per-frame objects.

A warmed same-process probe exercised four independent side-thread bounds over
a repeated top-to-bottom-to-top camera path. In two paired one-million-
projection samples, the least-interrupted position-only pass measured
`0.002339653ms` and the directional pass `0.002352473ms`, an increment of
`0.000012820ms` (12.8 nanoseconds) for all four threads. The second samples,
which ran amid substantial desktop CPU contention, measured `0.008001156ms`
and `0.003137001ms`; the directional pass remained below 0.019% of a 16.7 ms
frame even there. A separate nine-sample, one-million-step controller probe
measured an idle spring-frame median of `0.000097919ms` and a mixed active
boundary workload median of `0.000153856ms`. The active path remains below
0.001% of a 16.7 ms frame budget.

The Electron main and preload development builds completed, the renderer dev
server launched, and the Electron app started without a compile or shader
error. Focused regression cases now describe top release, free following,
bottom re-stick, the reverse direction, taller supporting documents, and the
76-pixel elastic bound. They were not run, and no automated test suite or
verification gate was run during implementation, in accordance with the
repository policy.

## Follow-up: independent supporting-grid scroll — 2026-08-04

The grid and Director previously shared one semantic camera. Even though the
supporting projection had Director-owned sticky stops, wheel input anywhere in
the window moved Director history and the supporting rows together. That also
meant scrolling an overlaid Now or Artifacts rail could move the graph beneath
it.

The centre spine and supporting flanks now own separate scroll positions. A
wheel gesture over the centre changes only Director history; a gesture over
either flank changes one shared supporting-grid document, preserving row
alignment across both sides. The ownership boundary is halfway between the
Director lane and the nearest packed side lane, so it follows responsive grid
geometry without duplicating the packer's breakpoint rules. The nearest lane
is cached when a snapshot or reflow arrives, leaving wheel routing constant-
time. The wheel listener is scoped to the graph surface rather than the window,
so independently scrollable rails no longer also drive the graph.

The supporting camera's start aligns its first row with the Director's actual
top position at the Director minimum. Its end aligns its last row with the
Director live edge at the Director maximum. A supporting document shorter than
that interval has a collapsed range and remains top-aligned. A taller document
can move freely between those stops; reaching its end opts into live follow,
while scrolling away preserves that independent position through new nodes and
viewport reflow. The existing sticky projection remains the final constraint,
and the grid's projected world offset cancels Director camera movement, so the
two regions are genuinely independent without changing node or edge geometry.

The custom canvas region also exposes a keyboard path: Page Up and Page Down
scroll Director history, while Shift+Page Up and Shift+Page Down scroll the
supporting grid. These shortcuts are declared with `aria-keyshortcuts`. Arrow
keys retain their existing node-by-node peek behavior.

The latest pre-change four-thread directional projection baseline was
`0.002352473ms`. A warmed same-process before/after probe modeled a complete
500-node projection across three 50,000-frame samples. The least-interrupted
shared-camera pass measured `0.000425828ms` per projection and the independent-
camera pass `0.000432499ms`, an increment of `0.000006672ms` (6.7 nanoseconds).
The three independent-camera samples ranged from `0.000432499ms` to
`0.000442737ms`, below 0.003% of a 16.7 ms frame budget. A one-million-event
probe measured the cached scroll-owner decision at `0.000018903ms` (18.9
nanoseconds) per event. Bounds write into reused storage, the controller is
allocation-free, and scrolling adds no DOM nodes or React state updates; the
existing pooled labels receive their normal position update in the draw frame.

The Electron main and preload development builds completed, the renderer dev
server launched, and the Electron app started without a compile or shader
error. Focused regression cases were added for centre/flank routing,
Director-derived grid bounds, both sticky endpoints, independent scrolling,
and live-follow detachment. They were not run, and no automated test suite or
verification gate was run during implementation, in accordance with the
repository policy.

## Follow-up: symmetric overview framing and Director hierarchy — 2026-08-04

The overview's oldest camera bound previously put its first row at fitted clip
`0.9`, which is five percent from the unwarped viewport top. The live edge uses
the authored `-0.42` anchor instead. After the barrel pass, that mismatch left
only 22.70 CSS pixels above the first node at 1440 × 900 while the live node had
215.71 pixels below it. At the 912 × 1221 tall-window reproduction the mismatch
was 30.80 versus 374.73 pixels, and at 2048 × 1299 it was 32.77 versus 413.52
pixels. The top node and its particle envelope could therefore sit under the
window chrome even though the bottom stop had generous framing.

Columns and grid now derive the oldest bound by reflecting the existing live-
edge anchor around the viewport centre. Because the barrel transform is
radially symmetric, top and bottom retain equal post-warp edge clearance at
every viewport size: 215.71 pixels at 1440 × 900, 374.73 pixels at 912 × 1221,
and 413.52 pixels at 2048 × 1299 in the same centre-lane probe. The rule adds no
viewport percentage or chrome constant and changes neither node scale nor
ladder spacing. The single-conversation look-back frame remains unchanged.

Dense-grid workers also previously used Director's full node envelope. A live
input body could therefore occupy about 58.30 CSS pixels while settled and
90.20 pixels while working, before its particle glow, making sixteen summary
cells compete with the centre spine. Grid-supporting nodes now use one fixed
`0.62` hierarchy scale: the equivalent envelopes are 36.15 and 55.92 pixels.
Director remains at the canonical 58.30 and 90.20 pixels. The scale is applied
to the complete particle displacement, point body, glyph, field halo, label
offset, and outcome hit geometry; it is not derived from viewport dimensions.
Columns and individual conversations continue to use canonical sizing.

The renderer adds no particles, instance data, frame allocations, DOM nodes,
or draw calls. It uploads two scalar hierarchy uniforms to the existing node
and glyph passes and evaluates a fixed Director-range mask in their vertex
shaders. A warmed alternating nine-sample CPU probe over five million diameter
calculations measured a median 13.937 ns per node before hierarchy scaling and
15.181 ns after, an increment of 1.244 ns per evaluated node. Even if all 100
visible nodes required CPU envelope work in one frame, that increment would be
about 0.000124 ms; the real halo and label paths inspect fewer nodes.

The Electron main and preload development builds completed, the renderer dev
server launched, and the Electron app started without a compile or shader
error. Focused regression cases now describe symmetric post-warp stops across
desktop and tall viewports and the fixed supporting hierarchy scale across
particle bodies and glyphs. They were not run, and no automated test suite or
verification gate was run during implementation, in accordance with the
repository policy.

## Follow-up: dense grids open at the live edge — 2026-08-04

The independent supporting-grid controller previously initialized at its
oldest bound and marked itself detached. During a high-count simulation that
often happened while only the first rows were available, so later rows could
extend the scroll range without moving the camera. The result was a 64-item
activity grid opening on its beginning rather than on the current work.

The grid controller now owns an explicit initial edge and production configures
that edge as `live`. On first layout it selects `liveEdgeWorldY` and enters the
same follow state used when a user scrolls back to the bottom. If loading grows
a sample range from `{ oldest: 3, live: 8 }` to `{ oldest: 3, live: 10 }`, the
camera therefore moves from 8 to 10. Scrolling upward clears follow; a later
growth to live edge 12 then preserves the user's detached position. Grids whose
bounds collapse because all rows fit are unchanged because their oldest and
live positions are equal.

This changes one initialization branch on a controller created once per graph
surface. It adds no frame-path iteration, polling, allocation, DOM work, GPU
work, or draw call; steady-state reconciliation still reads the existing
`followingLiveEdge` boolean. The Electron main and preload development builds
completed, the renderer dev server launched, and the Electron app started
without a compile error. Focused regression coverage was added for bottom-first
initialization, live growth, and user detachment. It was not run, and no
automated test suite or verification gate was run during implementation, in
accordance with the repository policy.

## Follow-up: Phosphor Fill graph glyph atlas — 2026-08-04

The graph previously rasterized twelve locally drawn outline glyphs into a
single 768 × 64 canvas atlas during renderer construction. Steady-state glyph
rendering was one instanced WebGL draw over that one texture; it performed no
per-frame canvas drawing and added no DOM. That render shape is the baseline
for this visual change.

The atlas now rasterizes twelve directly imported Phosphor Fill SVG paths with
cached `Path2D` objects. Only the selected 4,069 bytes of source SVG assets are
imported; the package's complete catalog is not loaded into the renderer. The
atlas dimensions, texture upload, sampler, shader, instance data, and one-draw
submission are unchanged. Therefore the after state adds zero frame-path JS,
DOM nodes, buffer uploads, texture binds, or draw calls. SVG extraction and
twelve `Path2D` constructions happen once when the atlas is first created.

The app was launched through the development main, preload, and renderer
paths, then captured through `webContents` at 2560 × 1640. The filled Check Fat,
Microphone, Terminal Window, and File Text silhouettes remained distinct at
the graph's real small render sizes. X Circle replaces Phosphor's box-shaped
filled X for a clearer failure silhouette, and the compact Dot Outline asset
preserves the low visual weight of dense-grid placeholder nodes. No automated
test suite or verification gate was run, in accordance with repository policy.

## Follow-up: responsive title measure and shared rail marks — 2026-08-04

Column lanes previously retained their 168 CSS-pixel reference gap at every
viewport width, leaving a 144-pixel title budget even when the centre reading
band had unused space. Expanding against the whole canvas was not valid either:
the graph intentionally draws beneath the two flanking rails, so that version
pushed its first and last titles into rail content.

The column packer now spends only the central 64% reading band. It retains the
reference gap as a floor, grows to a 320-pixel cap, and uses that same band when
deciding whether columns still fit or need the grid. In a disposable 1600 × 900
Electron window, five columns received a 181-pixel title budget instead of the
previous 144 pixels. All five fixture names rendered in full, with complete
title bounds from x=334.5 to x=1298.4 while the flanking rail boundaries were
x=300 and x=1300. At 1400 pixels the budget was 155 pixels and the two longer
names truncated; their existing focus/hover tooltip exposed the complete text.
At 1000 pixels the same five graphs selected the grid and floating rails rather
than entering the flanking rail bands.

Titles now carry a bounded opaque-centre gradient and text shadow. There is no
`backdrop-filter`, canvas readback, additional DOM, or JavaScript in the frame
loop. Responsive spacing is evaluated only when a semantic snapshot is packed
or reflowed; steady-state scrolling retains the existing title transforms.

The minimized Now strip no longer assigns a second palette by narration kind.
A computed-style probe confirmed matching expanded/minimized RGB values for
ordinary activity (77, 204, 242), success (92, 245, 161), and failure
(255, 74, 94), with the same 0.55 historical opacity. No automated test suite
or verification gate was run, in accordance with repository policy.

## Follow-up: fit-aware short trails and thread navigation — 2026-08-04

The six-worker grid still selected three-node trail cells from count alone. At
912 × 744, each flank could fit only one 220-pixel column, so three 440-pixel
rows authored 1,320 pixels of supporting scene height into a 484-pixel usable
band. Before the change, worker-title rows began around y=-364, -10, and 446.
One 520-pixel side-wheel gesture moved the last row to y=794, beyond the
viewport, even though one current node per worker would have fit without an
independent row list.

The level of detail now comes from both count and available geometry. A short
trail remains only when every flank can place its three-node envelope inside
the usable scene; otherwise that low-count grid becomes a single, fixed-size
activity row. Cell minimums choose representation but never manufacture scene
height. A one-row overview follows the Director's camera, while only a genuine
multi-row supporting grid owns an independent scroll controller.

In the same 912 × 744 reproduction, six workers rendered as six activity nodes
plus the current Director state. All worker titles occupied one row, document
overflow remained 0 pixels on both axes, and the same side-wheel probe moved
every worker title by 0 pixels while the one-node Director had no history to
scroll. At that viewport, four workers retained recent trails; at 1710 × 1073,
six workers also retained trails. Resizing the live six-worker simulator across
that boundary changed the rendered snapshot from 8 nodes to 19 and back without
a runtime error or a cold camera reset.

Older nodes in a retained trail now use a 0.24 opacity decay: newest at full
strength, previous at 24%, and oldest at 5.76%. The Director remains unreduced.
Worker headings become native buttons when their workstreams are real
destinations; hover or focus previews the newest node and exposes the complete
title, while activation reuses the existing full-conversation transition. The
simulator correctly leaves its synthetic headings non-interactive, although
node hover still showed the contextual activity tooltip.

Both idle samples requested 120 animation frames in a visible disposable
Electron window on the same 60 Hz display:

| Metric                             |                Before |                 After |
| ---------------------------------- | --------------------: | --------------------: |
| Average frame rate                 |                 60.03 |                 60.00 |
| Frame delta p50 / p95 / p99 (ms)   | 16.70 / 17.00 / 17.60 | 16.70 / 18.50 / 18.60 |
| Maximum frame delta (ms)           |                 17.70 |                 18.60 |
| Long tasks                         |                     0 |                     0 |
| DOM mutation records while sampled |                    15 |                     0 |

The after sample remained below 20 ms with no long task. The physical display
cannot demonstrate 120 presented frames per second; this sample verifies that
the responsive packing and semantic title controls add no continuous DOM churn
or observable large frame drop. No automated test suite or verification gate
was run, in accordance with repository policy.

## Follow-up: Director loading current — 2026-08-04

Director transport loading previously appeared as `Loading Director state.` in
the reply stack immediately above the composer. That path reserved DOM space at
the bottom of the graph and could show the graph's ordinary empty-state copy at
the same time, even though the Director had not finished loading.

Loading and resynchronisation now enter the existing WebGL field. A stable 14%
subset of the fixed 5,200 ambient particles rises from the lower viewport and
converges on at most four visible Director nodes; with no node yet available it
uses the authored Director live-edge position. A smaller subset circulates at
the destinations so the receiving nodes cohere rather than reading as a
spinner. This adds no particle buffer, texture, framebuffer, DOM node per
particle, or draw call. The ordinary graph path uses a coherent uniform branch
and skips the loading hashes and trigonometry entirely. Target collection also
returns at once while the effect is inactive.

The production shell was exercised with its disposable backend process paused
during snapshot loading. The graph region reported `aria-busy="true"`, the
reply stack was empty, and the ordinary empty-state element was absent while
the current was visible. Resuming the backend cleared the current and restored
the real empty state. A persistent, visually hidden polite status retained the
same progress information for assistive technology. Under emulated
`prefers-reduced-motion: reduce`, two pixel summaries sampled 800 ms apart had
identical previews, mean luminance, and content centroids; the formation is
static and the frame loop does not stay awake for it.

Visible 120-frame samples used the standalone production renderer at 912 × 744,
device pixel ratio 2, 1,368 × 1,116 scene/post surfaces, and the Apple M2 ANGLE
Metal renderer:

| Metric                           |    Before: idle field |     After: idle field | After: loading current |
| -------------------------------- | --------------------: | --------------------: | ---------------------: |
| Average frame rate               |                 60.00 |                 60.00 |                  60.00 |
| Frame delta p50 / p95 / p99 (ms) | 16.70 / 17.40 / 18.50 | 16.70 / 18.60 / 18.60 |  16.70 / 18.60 / 18.60 |
| Maximum frame delta (ms)         |                 18.60 |                 18.70 |                  18.70 |
| Frames over 32 ms                |                     0 |                     0 |                      0 |
| Long tasks                       |                     0 |                     0 |                      0 |
| DOM mutation records             |                     0 |                     0 |                      0 |

The loading current matched the paired idle sample and introduced no observable
frame drop or continuous DOM work. No automated test suite or verification gate
was run, in accordance with repository policy.

## Follow-up: complete grid trails and continuous short-thread follow — 2026-08-04

The retained three-node grid trail reused layout openness as its opacity. The
edge vertex shader also multiplied geometric growth by the minimum endpoint
openness, so the previous node's 24% opacity drew only 24% of its beam and the
oldest node's 5.76% opacity drew only 5.76%. The result was a pair of bright
vertical stubs rather than complete, fading connections.

Grid side edges now keep their complete geometry and apply a perceptual
square-root fade only to fragment alpha. Nodes retain the rapid 24% and 5.76%
decay, while their connecting beams remain discernible at 49% and 24%. One
float uniform selects the behavior and the existing contiguous Director range
keeps ordinary Director fold/arrival growth unchanged. This adds no geometry,
buffer, texture, upload range, draw call, DOM node, or frame-path allocation. A
paused 4×4 production-renderer capture showed both connecting beams spanning
their node pairs without reading as bright truncated stubs.

A one-row grid was already routed to the Director for wheel ownership, but its
projection still reconciled the independent multi-row grid camera. It now uses
the same per-thread Director-bounded offset as side-by-side columns; only a
real multi-row grid creates an independently scrolling side document. All five
4×4 headings also reported an exact 64 CSS-pixel top coordinate and
`data-pinned="true"`, while multi-row headings remain attached to their own
scrolling tiles. The dev-only simulator control now begins at 96 pixels rather
than covering the trailing heading's 64–83-pixel box.

The last visible jump was in the Director camera itself. While the Director was
shorter than the overview range, its oldest and live camera bounds collapsed to
one point. The general content clamp therefore replaced eased live following
with an immediate 0.20-world-unit move whenever a Director-only node arrived.
An attached camera may now trail a growing live edge while remaining unable to
lead past it; a user-detached history camera still receives both hard bounds.
On the same 3-thread simulated arrival, the maximum frame-to-frame camera move
fell from 0.2000 to 0.0096 world units. The unchanged side row moved 0.00005
world units at that arrival.

Paired settled 4×4 samples requested 120 visible animation frames in the same
912 × 744 Electron window at device pixel ratio 2, with 1,368 × 1,116 full-tier
scene and post surfaces:

| Metric                           |                Before |                 After |
| -------------------------------- | --------------------: | --------------------: |
| Average frame rate               |                 60.00 |                 59.88 |
| Frame delta p50 / p95 / p99 (ms) | 16.70 / 17.50 / 17.60 | 16.70 / 18.40 / 18.50 |
| Maximum frame delta (ms)         |                 17.70 |                 18.70 |
| Frames over 32 ms                |                     0 |                     0 |
| Long tasks                       |                     0 |                     0 |
| CPU frame p50 / p95 / p99 (ms)   |                     — |    0.10 / 0.20 / 0.40 |

The after sample stayed below 20 ms with no dropped frame or long task. No
automated test suite or verification gate was run, in accordance with
repository policy.

## Follow-up: furthest-live follow without losing the fluid field — 2026-08-05

Two independent regressions met in the same frame path. One-row overviews
derived their camera edge from Director column zero even when a side thread's
newest node was lower. Separately, the large-viewport density transform scaled
the field's already-animated coordinate. Its density remained correct, but its
visible velocity shrank with the centre volume and the original ocean read as a
mostly static cloud.

The ladder now reports both the Director edge and the furthest committed edge
in one scan. An attached columns view or one-row grid follows the furthest
edge, while a multi-row grid retains its independent side-document scroll. The
Director camera bounds remain separate and continue to own all supporting
thread sticky anchors. In the reproduced 3×4 completion, the Director edge was
0.600 world units, the furthest side edge and automatic target were 0.740, and
the settled projected maximum was 0.738 while the camera was still completing
its final ease. Scrolling back detached at 1.550 and held there while the live
target remained 2.200; scrolling to the bottom reattached at 2.200.

The field retains the already-solved density contract rather than replacing
it: one fixed, deterministic 5,200-particle allocation; an area-proportional
draw prefix for small windows; and the same centre-weighted spread and edge
falloff for large windows. A 400×800 capture allocated 5,200 and drew 2,600;
the 1710×1073 capture allocated and drew 5,200. Only the coordinate arithmetic
changed. It now scales the stable seeded position, then wraps the unscaled
fluid displacement inside that density domain. At the 800-pixel reference
scale this reduces exactly to the original `fract(p) * 2 - 1` ocean path. The
loading current remains a conditional mix after that ordinary field position
has been resolved.

Paired settled 3×4 samples used a visible 1710×1073 Electron renderer at DPR 2
on Apple M2 through ANGLE Metal, with 2,394×1,503 post and 1,784×1,120 scene
surfaces. Each sample requested 180 animation frames.

| Metric                                 |                        Before |                         After |
| -------------------------------------- | ----------------------------: | ----------------------------: |
| CPU p50 / p95 / p99 / max (ms)         |     0.10 / 0.30 / 0.30 / 2.20 |     0.10 / 0.30 / 0.40 / 0.40 |
| GPU p50 / p95 / p99 / max (ms)         |     3.95 / 6.32 / 8.99 / 9.28 |     3.65 / 5.61 / 7.22 / 8.34 |
| Frame delta p50 / p95 / p99 / max (ms) | 16.70 / 17.60 / 17.60 / 17.70 | 16.70 / 17.60 / 17.70 / 17.70 |
| Dropped-threshold frames               |                             0 |                             0 |
| Long tasks                             |                             0 |                             0 |

A separate 180-frame scroll sample used the partially completed 3×16 scene
with 46 nodes. It scrolled away from live for 70 frames, returned for 70, and
then settled attached. CPU p95 / p99 / max was 0.30 / 0.40 / 1.20 ms; GPU p95 /
p99 / max was 6.58 / 7.11 / 7.40 ms; frame-delta p95 / p99 / max was 17.60 /
17.60 / 17.60 ms. It recorded no dropped-threshold frame and no long task.

No automated test suite or verification gate was run, in accordance with
repository policy.
