# Easy Button pane: pixel-match delta report

Date: 2026-07-09
Phase C of `docs/plans/easy-button-pixel-match-20260709.md`.

Compares the shipped pane against `docs/mockups/easy_button_pane_mockup.html`,
component by component, and classifies every remaining difference as **fix**,
**accept**, or **deliberate non-restoration**.

Four deltas were fixed. Everything else is accepted, with the reason recorded
below. One line of the plan's own token mapping table turned out to be factually
wrong and is corrected here.

> **Revised after review.** This report originally fixed two deltas (D1, D2) and
> accepted A1 (`--muted`) and A3 (line-heights). Both acceptances were wrong, for
> the reasons recorded in those sections, and both are now fixed. It also claimed
> the Stop button suffered D1; it did not. After the revision, **zero leaf
> components differ on `lineHeight`, `color`, or `fontSize`** in any captured
> state.

## How the comparison was made

The mockup is a fixed 1180x660 card; the real pane fills a workspace column. A
whole-pane diff would be meaningless, so nothing compares whole panes. Both are
rendered in the **same Electron 41 binary** at `deviceScaleFactor: 1` and 1440px
wide, which is what makes the comparison possible: at that width both
`grid-template-columns: minmax(240px, 300px) 1fr minmax(280px, 380px)` tracks
clamp, so **both rails are exactly 300px and 380px**, and every component inside
them has the same available width.

Three instruments, all in `desktop/tests/electron/easy-button-pixel-match-probe.js`:

1. **Pinned frames.** CSS animations and transitions are Web Animations, so
   `root.getAnimations({ subtree: true })` reaches them all, including the
   button's `::after` glow. Perpetual animations are paused and seeked to a fixed
   `t`; transitions and one-shot entrances are `finish()`ed instead, because
   freezing those part-way pins the pane to a value that belongs to no state at
   all (the swirl's 1600ms crossfade lands on neither 0.85 nor 0.2, and an
   artifact card caught inside its 520ms arrival is still transparent). Frames
   are captured at `t = 0ms` and `t = 4500ms`.
2. **Component metrics.** For 38 components, on both surfaces: 53 computed style
   properties, the border-box rect, the runtime-resolved value of every design
   token, and the advance width of a fixed string in the element's own font
   stack. Read *after* pinning, so the numbers describe the frame that was
   captured.
3. **Rasterized glyph comparison**, where a font question could not be settled
   from a width alone.

Nothing test-only was added to the product. Component identity comes from the
class names the pane already ships.

### Determinism, and why there is still no image-diff gate

With animations pinned, the mockup renders **28/28 frames byte-identical across
runs**. The production pane does not, and the reasons are instructive:

- Opening the pane slides its workspace column into place. That animation belongs
  to the layout, not the pane, so pinning the pane's subtree cannot freeze it —
  the idle pane was captured at `x = 253.1` in one run and `x = 243.77` in the
  next. The harness now waits for three identical rect reads first.
- Fractional clip origins put the same content on a different subpixel grid.
  Clips are now snapped to whole pixels.

After both fixes, 35/38 frames are byte-identical run to run. The remaining three
carry the run's own elapsed-time text ("Done in 0.2s" vs "0.3s"), which is real
content, not rendering noise.

That residue is exactly why Tier 3 stays declined. A pixel-equality gate would
have to tolerate text that legitimately changes and antialiasing that
legitimately does not, and the tolerance that admits one admits the other.
Measured here: a genuine defect moved a channel by **53/255**; the machine's own
rendering noise moved it by **0–2**. A parameter diff separates those cleanly. An
image hash does not.

## Deltas: fix

### D1 — The swirl paints on top of the agent chip, the caption, and Stop

`.easy-button-swirl` is `inset: -100%` on the button well, so its field is
**540x540** around a **180x180** well and reaches 180px past it on every side. It
is `position: absolute; z-index: 0`. The agent chip, the caption slot, and the
Stop button were all in flow with `position: static; z-index: auto`, so by CSS
painting order the blurred, saturated, screen-blended field painted **over their
text**.

The mockup does not have this problem because `.agent-chip` and `.caption-slot`
each carry `position: relative; z-index: 2`. That pair of declarations was not
carried across.

Measured, before the fix:

| | production | mockup |
| --- | --- | --- |
| `captionSlot` position / z-index | `static` / `auto` | `relative` / `2` |
| `agentChip` position / z-index | `static` / `auto` | `relative` / `2` |
| `swirl` rect | 540x540 | 540x540 |
| `captionSlot` rect | 460 wide, 112px below the well's centre | same |

The rects overlap, so the field covers the caption. Proven by capture rather than
by reading the cascade: pinning the `working` frame at `t = 0` before and after
the fix, over the 540x540 field region, **10.27% of pixels changed, max channel
delta 53**. The run-to-run noise floor for that same crop is **0 differing
pixels**. In the `complete` state the swirl rests at `opacity: 0.2` and the same
diff is `max channel delta 3` — the defect scaled with the field, as it should.

**Fixed** in `easy-button.css`: `.easy-button-agent-chip-slot`,
`.easy-button-caption-slot`, and `.easy-button-action-slot` are lifted to
`position: relative; z-index: 2`. Production lifts the fixed-height *slots* rather
than the chip and caption themselves — the slots are the layout boxes and reserve
height in every state — which is why `agentChip` still reports `static` / `auto`
in the table below. The paint order is the same.

`.easy-button-action-slot` has no mockup counterpart and is lifted with them.

**Correction:** the claim that the Stop button had the same defect is wrong. Its
top edge sits ~201px from the well's centre against a 205px mask radius, where the
field's alpha is ~0.04. Measured: the reddest pixel of its `--destructive` border
is byte-identical before and after the fix, `rgb(226, 131, 123)`. Lifting the
action slot is correct by symmetry and costs nothing, but it repaired nothing.

Independent confirmation of the caption defect, against the token rather than the
cascade: the helper line's brightest pixel was `rgb(93, 132, 165)` — **+18.7 luma
above its own `--setta-500`**, and green-shifted by the cyan field composited onto
the glyphs. After the fix it is `rgb(90, 105, 141)`; `--setta-500` is
`rgb(86, 105, 143)`.

### D2 — The footer pill is 4.5px too tall

`.easy-button-input` declares `font: inherit`, and the `font` shorthand also sets
`line-height`. A text input otherwise takes `line-height: normal` from the UA
stylesheet, so this made the pill's height a function of the *app's root
typography* rather than of its own font.

| | production (before) | mockup |
| --- | --- | --- |
| `input` computed `line-height` | `19.5px` | `normal` (15px) |
| `input` rect | 511.98 x 43.5 | 511.98 x **39** |
| `inputWrap` rect | 560 x 45.5 | 560 x **41** |

Padding (`12px 0`), radius (`999px`), border, and width were already identical.

**Fixed**: `line-height: normal` on `.easy-button-input`. The pill now measures
560x41 and the input 511.98x39, matching the mockup exactly. The pane's footer
grid track went from 69.5px to 65px, which is the mockup's value.

## Deltas: accept

### ~~A1~~ → D3 — `--muted` was one step darker than the mockup

**Reclassified to a fix.** The acceptance below is preserved for its measurement
and its account of *why* the token resolves to `--setta-400`, which was the
report's real discovery. Its conclusion was wrong on two counts. The pane pins
its whole dark ladder (`--setta-900/875/925/750/500` are all hardcoded), so
tracking one themeable token bought no theming. And `firstReadableForeground`
prefers the *dimmest readable* candidate — on a dark surface `--setta-300` is
lighter, so it has **more** contrast than `--setta-400`, not less; nothing was
being guaranteed by keeping the darker value. `--easy-button-muted` is now pinned
to `var(--setta-300)` and measures `oklch(0.7167 0.0439 264.25)` in the live pane,
matching the mockup exactly.

The plan's token mapping table claims `--muted` maps to `--muted-foreground`,
"(`--setta-300`)", with an exact `oklch()` match. Resolved at runtime inside the
live pane:

| | value | token |
| --- | --- | --- |
| production `--easy-button-muted` | `oklch(0.6255 0.0618 263.97)` | `--setta-400` |
| mockup `--muted` | `oklch(0.7167 0.0439 264.25)` | `--setta-300` |

`styles.css` really does say `--muted-foreground: var(--setta-300)`, and in an
isolated page that is what it resolves to. But `appearance-store.ts` writes the
shadcn palette onto `document.documentElement` as inline styles at runtime, and
the dark scheme derives `mutedForeground` in `internal/appearance/color_schemes.go`:

```go
mutedForeground := firstReadableForeground(
    []string{tailwind.Setta875, tailwind.Setta850},
    tailwind.Setta400, tailwind.Setta300, ...)
```

`--setta-400` clears WCAG AA on those surfaces, so it wins, and the inline style
beats the stylesheet.

**Accept.** Production follows the app's live, user-themable, contrast-checked
token. The mockup pinned a stale copy of what that token was believed to be. The
mockup's own comment (`/* setta-300 muted-foreground */`) shows the intent was
"the app's muted foreground", which is what production uses. Hardcoding
`--setta-300` would break user themes and bypass the contrast guarantee.

The plan's mapping table should read `--muted` → `--muted-foreground` (**runtime
`--setta-400`; the static declaration in `styles.css` is overridden by the
appearance store**), not `--setta-300`. Corrected in the plan.

### A2 — `--accent-magenta`

`oklch(0.77 0.135 335)` vs the mockup's `oklch(0.735 0.155 343)`. Known and
intended; production's token wins. One swirl arm.

### ~~A3~~ → D4 — Text was set 5–19% tighter than the mockup

**Reclassified to a fix.** The reasoning below — "the mockup never specifies
these" — is false. The mockup specifies its line height exactly once, on `body`:
`line-height: 1.5`, unitless. Tailwind's preflight states the identical unitless
`1.5` on `html`, so the pane already inherits the mockup's value for everything
unpinned (markdown body, bar labels, bar values, highlight text). Phase A then
overrode it on **fourteen** elements with numbers that have no source, while
copying the mockup's `margin-bottom: 3px` / `10px` verbatim — margins tuned
against 1.5 line boxes. The card's internal spacing was a rhythm nobody designed.

All fourteen deleted; one `line-height: 1.5` on `.easy-button-surface` gives both
root-independence *and* the mockup's value, at a net −13 declarations. Three
carve-outs survive, all structural rather than typographic: `.request-text` at
`1.45` (the mockup's `.transcript` specifies it), `.input` at `normal` (D2), and
`.stop-button` at `1` (a fixed 34px control with no mockup counterpart).

Measured after the fix: every leaf in the table below now matches the mockup
exactly. The original acceptance follows.

Nine components. The mockup **never specifies** any of these; they are `1.5`
inherited from its `body`. Production pins each one so the pane's typography does
not depend on the app's root line-height.

| component | production | mockup |
| --- | --- | --- |
| rail label ("Now" / "Artifacts") | 10px | 15px |
| agent chip | 10.5px | 15.75px |
| helper, summary | 16.875px | 18.75px |
| artifact kicker | 12px | 15px |
| artifact title | 16.25px | 19.5px |
| artifact table | 15.6px | 18px |
| artifact table `th` | 13.65px | 15.75px |
| artifact table `td` | 14.95px | 17.25px |
| highlight row | 18.2px | 19.5px |
| enter chip | 14px | 15px |

**Accept.** Every *specified* value matches: font sizes, weights, letter-spacings,
`text-transform`, `font-variant-numeric`, and colors are identical, and the D2 fix
applies the same reasoning in the one place where the inherited value leaked into
a *box* rather than a line box. The visible consequence is that an artifact card
is denser than the mockup's; the card's width is identical (336px on both).

### A4 — Font stacks are spelled differently and resolve identically

| | production | mockup |
| --- | --- | --- |
| mono | `SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` |
| sans | `Inter, ui-sans-serif, system-ui, …` | `system-ui, -apple-system, …` |

`getComputedStyle().fontFamily` reports the *requested* list, never the face the
engine picked. Rendering `0123456789` at 11px in each element's own stack: **mono
advance 66.23px on both, sans advance 67.23px on both.** Same faces. **Accept.**

Separately, the footer's decorative `⏎` chip renders correctly — its raster
(226 ink pixels at 40px) differs from the same stack's notdef box (407), so it is
the real U+23CE glyph and not a fallback square, on both surfaces.

### A5 — Keyframe names are namespaced

`easy-button-swirl-spin-cw` vs `spin-cw`, `easy-button-glow-breathe` vs
`glow-breathe`, and so on. Every duration, easing, iteration count, direction,
fill mode, blend mode, filter, and mask is identical — verified: swirl
`filter: blur(30px) saturate(1.3)` and the same `radial-gradient` mask string on
both. **Accept.**

### A6 — `will-change` and idle pause differ, on purpose

Production scopes `will-change: transform` to the working state and pauses the
swirl at idle (`animation-play-state: paused`); the mockup leaves both on
permanently. These are Phase B's performance decisions and the reason an idle
pane costs nothing. **Accept** — and they are asserted by the workflow, not just
observed here.

### A7 — Structural differences with no visual consequence

- `.pane-body` is `position: absolute` inside the mockup's fixed-height card;
  `.easy-button-surface` is the grid itself. The mockup's `.pane-body` is
  transparent and its `.pane-host` carries the background; production paints
  `--setta-900` on the surface directly.
- Production nests `.easy-button-center` (a flex column) inside
  `.easy-button-stage` (a flex row that centres it). The mockup's `.stage` is the
  column. Same result.
- Centre grid track: `520px` vs `498px`. The rails are identical (300 / 380); the
  centre is `1fr` and the two panes differ in total width by 22px.
- `.easy-button-control` centres its glyph with `justify-content: center` (track
  `40px`); the mockup uses `place-items: center` (track `178px`). Identical
  optical centre, identical 40x40 glyph.

**Accept.**

### A8 — Production's robustness guards

`min-height: 0` on the rails, the stage, and the highlight list;
`overflow-wrap: anywhere` on every text block; `max-width: 180px` on table cells;
`-webkit-line-clamp: 4` and `overflow: hidden` on the request text;
`vertical-align: top` on `td`; `overflow-y: auto` on the summary and the rails.
None change rendering for the mockup's own content. Real artifact data is nastier
than four fixed rows. **Accept.**

### A9 — Entrance transitions the mockup needs and production does not

The mockup fades `.transcript` and `.summary` in from `opacity: 0`, because they
are always in the DOM. Production mounts them only in the states that have them,
already at rest, so they carry no transition. `.easy-button-control` adds `color`
to its transition list (the glyph tones on failure). **Accept.**

## Not deltas — deliberate non-restorations

Confirmed absent from the pane, and not reported above: the `listening` state,
rings, mic glyph, "Tap to speak", the typing caret; button-as-stop (the pane
keeps a static Sparkles glyph while working and a separate Stop control); the
`.a-plate` SVG diagram artifact and the table's `winner` row; the mockup's
"3 agents" chip and all its demo data; pane chrome; the `failed` and `stopped`
tones, which have no mockup counterpart.

The mockup's `working` state is captured with empty rails: its demo stages rail
arrivals on timers and auto-advances to `complete` after ~10.2s, so the renderer
neutralizes `setTimeout` before driving it. Its rail labels therefore read
`opacity: 1` over empty rails in that one frame. Compare highlight rows and
artifact cards in the `complete` frames, where the mockup populates them
synchronously.

## Coverage gaps found

Not pixel deltas, but the harness surfaced them:

1. **`bar_chart` and `file` artifact kinds had no deterministic E2E coverage —
   now closed.** No scripted run in `scripted_workflow_harness_easyrun.go` emitted
   either, so neither renderer had ever executed; the probe reported `barRow`,
   `barLabel`, `barTrack`, `bar`, and `barValue` as **absent from production**
   while the mockup rendered all five. Their Phase A restyle was verified only by
   inspection — the same blind spot that hid the highlight age-fade bug.

   The phase-3 scripted turn now emits all four artifact kinds. The workflow
   asserts the kind order, the file artifact's rendered path and description, and
   that `barWidthStyle` scales each bar against the largest value (`33% / 50% /
   100%` for `0.8 / 1.2 / 2.4`). The probe now reports all five bar components
   present, so the chart is measured against the mockup rather than eyeballed.
2. **The confirm pulse never appears in a captured frame.** It is a finite 900ms
   animation, so pinning lands it on its endpoint, and production clears
   `data-easy-button-confirm` after 1000ms anyway. Its parameters are asserted by
   the workflow; its rendering is unphotographed.

## What changed

**Product (2 fixes, CSS only, 19 lines, no TSX):**

- `desktop/src/renderer/src/features/easy-button/easy-button.css`
  - D1: `.easy-button-agent-chip-slot`, `.easy-button-caption-slot`,
    `.easy-button-action-slot` → `position: relative; z-index: 2`.
  - D2: `.easy-button-input` → `line-height: normal`.

**Tests / harness (no assertions weakened, none added to the required gate):**

- `easy-button-pixel-match-probe.js` (new) — `pin(root, t)` and
  `measure(root, surface)`; one component table holds both surfaces' selectors.
- `easy-button-pane-driver.js` — `easyButtonPinAnimations(t)` and
  `easyButtonPixelMatchMetrics()`; version bumped to `v2`.
- `easy-button-pixel-match.mjs` (new) — the capture pass, run at the end of the
  existing `easy-button-pane` workflow in its own Electron context. Pinning is
  one-way for the CSS animations it touches, so it must not precede anything that
  reads `animation-play-state`.
- `easy-button-pixel-match-report.mjs` (new) — clipping and the metric diff, pure,
  so the mockup renderer can import it without the CDP harness.
- `easy-button-mockup-render.mjs` + `easy-button-mockup-driver.js` (new) —
  standalone; asserts nothing, so it is not a workflow.
- `easy-button-pane-actions.mjs` (new) — driver-call wrappers and waits shared by
  the workflow and the capture pass. The workflow lost 46 lines to it.

Artifacts land in `.recordings/<run>/pixel-match/` (gitignored): 38 production
PNGs, 28 mockup PNGs, `production-metrics.json`, `mockup-metrics.json`,
`delta.json`, `delta.md`.

To regenerate:

```
node desktop/tests/electron/easy-button-pane-workflow.test.mjs --skip-build \
  --artifact-dir .recordings/easy-button-phaseC
desktop/node_modules/.bin/electron desktop/tests/electron/easy-button-mockup-render.mjs \
  --out .recordings/easy-button-phaseC/pixel-match \
  --production-metrics .recordings/easy-button-phaseC/pixel-match/production-metrics.json
```
