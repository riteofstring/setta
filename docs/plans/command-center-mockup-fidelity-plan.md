# Command Center Mockup Fidelity Plan

**Date:** 2026-07-27
**Status:** Not started.

## Outcome

The Director command center looks like
`docs/mockups/fullscreen_conversation_concept.html` on the displays people
actually use.

`docs/reports/setta-4-mockup-fidelity-checklist-20260724.md` stays the binding
contract: section 1 is required UX, section 5 is the complete list of allowed
differences. Everything below closes a gap against section 1 that is not
covered by section 5.

## Diagnosis

The WebGL passes in `desktop/src/renderer/src/features/director-graph/render/graph-shaders.ts`
are a faithful port of the mockup's field, edge, node, glyph, and post passes.
The gap is elsewhere: the render quality the app selects at runtime, and the
DOM chrome layered over the canvas.

Five causes, in the order they cost the most visible fidelity.

### 1. `full` quality is unreachable on a retina display

`graphQualityForViewport` (`graph-quality.ts:116`) clamps the device pixel ratio
to 1.5 and then tiers on `cssArea × 2.25`:

- `full` needs `cssArea ≤ 977,778` css px² — about a 1280×764 window.
- `reduced` starts at `cssArea > 2,888,889` css px² — a maximized window on a
  large external display.

Every ordinary window on a retina Mac therefore renders at `balanced`, and a
large external display renders at `reduced`. Against the mockup that is:

| | mockup | `balanced` | `reduced` |
| --- | --- | --- | --- |
| particles per node | 24 (line 866) | 14 | 8 |
| edge segments | 12 (line 827) | 8 | 5 |
| field particles | 5200 (line 814) | 3400 | 1800 |
| scene ceiling | 2.3 MP (line 830) | 1.6 MP | 0.9 MP |
| post ceiling | 3.6 MP (line 831) | 2.6 MP | 1.5 MP |
| field flow | on | on | **off** |

The mockup has no viewport tiering at all. It renders one profile and lets the
adaptive render scale respond to measured GPU time (line 832). Production
inverted that: it pre-emptively drops fidelity by window size, then adapts on
top of the reduced profile.

`reduced` also clears `fieldFlow` (`graph-quality.ts:95`), which replaces the
drifting fluid medium with static points. Checklist section 1.2 names that field
as product identity, and section 5 does not list it as an allowed difference.

### 2. Graph labels lost their background

Mockup `.nlabel` (line 56) is a tinted chip: a solid background tint, single
line, `overflow: hidden`, `text-overflow: ellipsis`; `.nl-reason` (line 59)
adds a hairline border.

Production `.director-graph-label` (`director-graph.css:38`) has no background
and no border — bare text with a `text-shadow`, `text-wrap: balance`, and
`overflow-wrap: anywhere`, so it wraps. Unbacked wrapping text over a halftone
dithered field is the largest single legibility regression in the graph.

### 3. The Now rail is a stack of cards

Mockup `.hl` (line 88) is a two-column grid: a 6 px mode-colored dot and one
line of text. No background, no border, no card. Recency is opacity alone
(`.hl.old`, line 90). The rail label above it is 10 px uppercase
(`.rail-label`, line 86).

Production stacks four boxed sections in the same space:

- `.director-activity-item` (`director-command-center-activity.css:12`) — filled
  and bordered per row, 44 px minimum row height (line 42).
- `.director-history-list li`, `.director-selected-status`,
  `.director-action-item` — the same fill and border
  (`director-command-center.css:248`).
- `.director-rail-section h2` (`director-command-center.css:240`) at
  `clamp(1.35rem, 2vw, 2.1rem)` — up to 34 px, restating the title the top bar
  already renders as `.director-focus-title`
  (`DirectorWorkstreamNavigation.tsx:181`).
- A live-status line and, for a workstream, a folder chip and a status chip.

### 4. Hit-target minimums are expressed as visible box size

Every control carries `min-block-size: 40px` plus a visible border and fill
(`director-command-center.css:78`); activity rows are 44 px
(`director-command-center-activity.css:42`); the composer pill is 48 px with
42 px filled buttons (`director-command-center-composer.css:32`, `:116`).

The mockup's equivalents are hairline and transparent: `.tb-chip` is
`4px 11px` padding on a 1 px border, and the composer is a hairline pill whose
only trailing affordance is an `⏎` glyph (line 116). The accessibility
requirement in checklist section 5 item 5 is a *hit area*, not a drawn box.

### 5. The type scale drifted from px to rem

The mockup pins an explicit small scale — 10, 11, 11.5, 12, 13 px, with
uppercase kickers at 0.13–0.14 em tracking. Production sizes chrome in rem
fractions (0.7rem–0.88rem) plus one `clamp()` display heading, so the whole
frame scales with the root font size and lands heavier than authored.

## Hard Rules

- No compatibility layer. Replace the superseded CSS and view structure
  directly; do not add a fidelity mode, a theme flag, or a toggle that keeps the
  current appearance reachable.
- Do not reintroduce anything from checklist section 2. In particular this plan
  adds no dev bar, no quality picker, and no FPS readout.
- Typed sources are unchanged. This plan touches presentation only: no contract,
  event, projection, or store change is in scope.
- The reduced-motion profile stays an accessibility mode
  (`graphReducedMotionProfile`, `graph-quality.ts:105`). It is not a quality
  tier and does not gain or lose members here.
- Hit targets stay at 44 px. Phase 4 changes how that size is produced, not
  whether it exists.
- Quality tiers are not deleted. A 6K display still needs one; the tier
  boundaries and what each tier drops are what change.

## Phase 1 — Make `full` the tier real displays get

**Change.** Re-derive the tier boundaries in `graph-quality.ts` from measured
GPU time on the reference displays rather than from the current constants, so a
maximized window on a laptop and on a 4K external both resolve to `full`. Move
`fieldFlow` out of what `reduced` drops (`graph-quality.ts:95`); `reduced` drops
`grain` and `switchTear` only. Let `GraphQualityController` and the adaptive
render scale absorb the load, as the mockup does.

**Files.** `graph-quality.ts`, `graph-quality.test.ts`.

**Verification.** Baseline before and re-measure after with
`node desktop/tests/electron/director-command-center-performance.test.mjs`
at the viewports in
`docs/reports/performance/setta-4-target-performance-matrix-20260724.md`.
Record both runs in a new append-only report under `docs/reports/performance/`.
A boundary that cannot hold the observed refresh period at `full` is evidence
against that boundary, not a reason to disable the measurement.

## Phase 2 — Give graph labels their chip back

**Change.** `.director-graph-label` gets the mockup's tinted background and
hairline border, single-line layout, and ellipsis. Drop `text-wrap: balance` and
`overflow-wrap: anywhere` in favour of the bounded label budget.

Checklist section 5 item 7 allows two-line wrapping where a real public summary
needs it, so the bound is two lines with the chip intact — not the current
unbacked free wrap.

**Files.** `director-graph.css`.

**Verification.** `director-graph-canvas.test.ts` label placement plus the
deterministic command-center Electron workflow, and a screenshot at each
reviewed viewport.

## Phase 3 — De-box the Now rail

**Change.** Activity rows become the mockup's dot-plus-text grid: no fill, no
border, recency by opacity. History rows lose their cards. Remove the
`.director-rail-section h2` display heading; the top bar already owns the
selected title. The folder chip, status chip, and live-status line move to the
top bar's identity group or the summary disclosure, whichever the checklist row
for that fact already assigns them to.

**Files.** `director-command-center-activity.css`, `director-command-center.css`,
`DirectorNowRail.tsx`, `DirectorNowActivityList.tsx`.

**Verification.** `DirectorCommandCenterShell.test.tsx` plus the deterministic
command-center Electron workflow, which must still reach every moved control by
keyboard and still announce the live region.

## Phase 4 — Rebuild the chrome weight

**Change.** Chips and buttons become hairline and transparent at the mockup's
padding. The 44 px hit target is produced by padding or a pseudo-element
overlay, not by a drawn 40–48 px box. The composer returns to a hairline pill;
its send, voice, and discard affordances are restated at that weight rather than
as filled buttons.

**Files.** `director-command-center.css`,
`director-command-center-composer.css`, `director-command-center-navigation.css`.

**Verification.** The existing pointer-target assertions in the command-center
Electron workflow must still pass unchanged — that is the check that the hit
area survived the visual change — plus `better-accessibility` review of focus
visibility against the lighter borders.

## Phase 5 — Re-home the surfaces the mockup never had

**Change.** Approvals, resource requests, workspace start, and voice status are
real product needs with no mockup counterpart. Give each one a home that does
not compete with the canvas: the actionable ones follow the checklist section 5
item 8 disclosure pattern; the ambient ones fold into the composer hint or the
top bar. The Now rail returns to activity and history.

**Files.** `DirectorCommandCenterShell.tsx`, `DirectorNowRail.tsx`, and the
stylesheets the moved surfaces own.

**Verification.** Deterministic command-center Electron workflow covering an
approval, a resource request, a folderless start, and a voice turn — each still
reachable, still announced, and still resolvable from its new home.

## Exit Gate

The Phase 4 side-by-side review in checklist section 6, on representative real
displays, is still open. It is recorded as a release gate in
`docs/reports/setta-4-phase0-ownership-inventory-20260724.md` section 5 and was
explicitly left open by
`docs/reports/performance/setta-4-command-center-phase4-coherent-audit-20260725.md`.
That review is what closes this plan, and every gap above is one this plan
expects it to confirm closed.
