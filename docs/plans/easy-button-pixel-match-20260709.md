# Easy Button Pane: Pixel-Match The Mockup

Date: 2026-07-09

## Scope

`docs/plans/easy-button-pane-20260708.md` shipped the Easy Button pane's
*behavior*. Its *appearance* diverged from
`docs/mockups/easy_button_pane_mockup.html` far enough that the two are not
recognizably the same design. This plan closes that gap for everything the
mockup and the implementation have in common: the pane background, the button
and its swirl field, the highlight rail, the artifact cards, and the footer
input.

This is a restyle, not a feature. No contract, endpoint, event, store, or
backend behavior changes. Nothing about the narrator, the orchestrator, or
`setta.emit_artifact` is touched.

### What "pixel-matched" means here

For static geometry and color, it means literally: same tokens, same sizes,
same spacing, same type scale, same radii.

For animation, per-frame equality is neither achievable nor meaningful. What
*is* well-defined — and is where the whole visual identity lives — is every
parameter of a CSS animation other than the current time: keyframe geometry,
duration, easing, iteration count, direction, fill mode, the filter/blend
stack, and the mapping from pane state to animated property. Those are static,
inspectable, and assertable. The strategy section below commits to matching and
testing exactly those, and explicitly declines to build an image-diff gate.

## Locked Decisions

Confirmed with the user on 2026-07-09:

1. **Adopt the mockup's surface ladder verbatim.** The pane paints its own
   `--setta-900` background (not `--workspace-pane-surface`, which is
   `--setta-975`). Artifact cards and the button sit at `--setta-875`; the
   footer input and inset plates at `--setta-925`. The pane reads as a *lifted*
   surface. This is safe in practice: the pane opens at
   `widthSpec: { unit: "proportion", value: 1 }` and normally has no neighbour
   to clash with.
2. **Pin the dark ladder in both color modes.** The swirl/glow language is
   inherently dark and the mockup never specifies a light variant, so inventing
   one is out of scope. This also fixes a live bug: today
   `.easy-button-surface` takes its background from `--workspace-pane-surface`,
   which flips to `--setta-50` under `[data-color-mode="light"]`, while every
   card, plate, and border stays hardcoded to the dark ladder — a near-white
   pane full of near-black cards.
3. **The swirl is the only working-state indicator.** Delete
   `.easy-button-control-ring` and `.easy-button-spinner` (and the
   `LoaderCircle` import). Neither exists in the mockup. State is carried by the
   swirl fading in, the button dimming, the newest highlight dot pulsing, and
   the agent chip.
4. **Restore the fixed-height caption slot and its helper line**, with honest
   non-voice copy. The mockup reserves this height so the center never reflows
   between states.
5. **Terminal states are three, not one.** Added 2026-07-09 after Phase A
   review. See below.

## Terminal States: completed vs failed vs stopped

The mockup only ever depicts success, so it has one terminal state. Production
has three, and the renderer collapses all of them into
`data-easy-button-state="complete"`. Phase A hung three success-coded visuals
off that attribute — the cyan confirm pulse, the cyan button border, and the
newest highlight dot turning `--accent-green` — so **cancelling a run, or a run
failing, fired a celebratory confirm pulse.** The summary line withheld its
green `✓` correctly, so the pane contradicted itself.

The run status must be a separate attribute (`data-easy-button-status`, taking
the `EasyRun.status` value), and the three terminal tones are:

| | button border | confirm pulse | newest dot | glyph |
| --- | --- | --- | --- | --- |
| `completed` | `--accent-cyan` 40% | yes | `--accent-green` | check |
| `stopped` | resting | no | faint (`--setta-500`) | check |
| `failed` | `--destructive` | no | `--destructive` | ✕ |

Use `--destructive`, which the pane already spends on the Stop button and the
error line — do not introduce `--accent-red`. Gate the pulse in the controller
(so `data-easy-button-confirm` never goes `true` for a non-`completed` run)
rather than only in CSS; the attribute is what the E2E asserts on.

**Never `color-mix(in oklch, …)` between two chromatic tokens.** `oklch` mixing
interpolates *hue*, and the short arc from `--destructive` (hue 25deg) to any of
this pane's blue-greys (hue 263deg) runs backwards through magenta — a 55% red
mixed against `--easy-button-border` lands on hue 330 and paints **pink**.
Measured on the rendered pane: hue 295deg before, 359deg after. Mix toward
`transparent` (which preserves hue, as the `completed` cyan border already does),
or mix `in oklab` (which interpolates in a/b space and passes through grey).
The Stop button and error line shipped with this bug and were corrected.

Do not scope success rules to `[data-easy-button-state="complete"]` and then
override them for failure. Scope them to `[data-easy-button-status="completed"]`
outright — an override chain is the transitional-code smell this repo forbids.

## Bug Found While Scoping

`.easy-button-highlight-item` declares `animation: easy-button-highlight-arrive
220ms ease-out both`. Animation-origin declarations outrank normal author
declarations in the cascade, and `fill-mode: both` keeps the `to` keyframe
(`opacity: 1`) applied for the whole after-phase. So the filled `opacity: 1`
overrides every `[data-highlight-age]` rule and **the age fade never renders.**
Nothing tests it.

The mockup's own CSS comments this exact hazard:

> no fill-mode: once the animation ends the cascade (nth-last-child) owns
> opacity again, so entries can age-fade as newer ones are appended

Phase A fixes it by adopting the mockup's approach (no fill mode,
`:nth-last-child` cascade) and adds a computed-style regression assertion for
`animationFillMode` and per-item resting opacity.

## Not Restored From The Mockup

The mockup predates several deliberate decisions in the shipped plan. These
stay gone; do not "pixel-match" backwards into them:

- **`listening` state, rings, mic glyph, "Tap to speak", the typing caret.**
  Voice is deferred. `.rings` / `@keyframes ring-out` / `.glyph-mic` /
  `.transcript::after` are not ported.
- **Button-as-stop (`.glyph-stop`).** The center control focuses the input;
  Stop is a separate secondary control.
- **The `.a-plate` SVG diagram artifact and the table's `winner` row.** The
  diagram kind is an explicit v1 non-goal, and `winner` is mockup demo data
  with no contract field behind it. Inventing one would be fabricating content.

**Port the mockup's CSS, not its browser hedges.** The mockup is a standalone
HTML file someone might open in any browser, so it pairs every `mask-image` with
a `-webkit-mask-image`. This app ships exactly one engine — Electron 41 is
Chromium 146, and unprefixed `mask-image` shipped in Chrome 120 — so the prefixed
copies are legacy support for a non-target and were removed. Verified by
rendering: the masked artifacts-rail region is pixel-identical (563x1492px, zero
differing rows) with and without them. `-webkit-line-clamp` on the request text
stays: it predates this plan and remains the interoperable spelling.

Conversely, `markdown` and `file` artifact kinds exist in the contract but not
in the mockup. They are styled *in the mockup's idiom* (same card, kicker, and
title treatment; `--setta-925` inset plate for the file path). Flagged as
designed-to-match rather than specified.

## Token Mapping

The mockup was authored against real Setta tokens, so this is a mechanical
substitution, not a re-derivation. Every mockup variable maps to a production
token with an **exact** `oklch()` match except where noted.

| Mockup | Production | Note |
| --- | --- | --- |
| `--card` | `--setta-900` | pane background (decision 1) |
| `--panel` | `--setta-875` | button + artifact card |
| `--surface` | `--setta-925` | footer input, inset plates |
| `--border` | `--setta-750` | |
| `--fg` | `--foreground` (`--setta-100`) | |
| `--muted` | `--muted-foreground` (`--setta-300`) | **not** `--muted`, which is a surface (`--setta-875`) |
| `--faint` | `--setta-500` | labels, times, kickers |
| `--primary` | `--accent-cyan` | exact |
| `--accent-violet` / `-blue` / `-green` / `-teal` | same names | exact |
| `--accent-magenta` | `--accent-magenta` | **differs** (mockup `0.735 0.155 343`, prod `0.77 0.135 335`). Use production's. One swirl arm; not worth a new token. |
| `--mono` | `--setta-font-mono` | |
| `--radius: 8px` | unchanged | already matches |

Current code reaches for `color-mix(... var(--setta-300) ...)` and
`color-mix(in oklch, var(--setta-850) 82%, black)` in a dozen places where the
mockup names a flat token. Replace the color-mixes with the flat tokens; keep
`color-mix` only where the mockup itself uses it (`box-shadow`, focus rings,
border tinting).

## The Delta, By Region

### Pane and grid

The mockup's `.pane-body` is a 3×2 grid whose footer spans all columns, so the
input is centered on the **pane**. The implementation nests the footer inside
the center stage, so it is centered on the **middle column**.

```
grid-template-columns: minmax(240px, 300px) 1fr minmax(280px, 380px);
grid-template-rows: minmax(0, 1fr) auto;
/* footer: grid-column: 1 / -1 */
```

Keep the existing `max-width: 720px` rail collapse — a production concern the
mockup (a fixed 1180px page) never had.

### Center stage

| | Mockup | Implementation |
| --- | --- | --- |
| button well | 180px `place-items: center` well; swirl + button share its center | none; button sits directly in a flex column |
| swirl | 3 conic layers + radial core, `blur(30px) saturate(1.3)`, radial mask, `breathe 17s`, spins 18s/29s/41s, `mix-blend-mode: screen` | **absent** |
| working indicator | swirl `opacity: 0 → 0.85`; button dims; glow stills | rotating ring arc + `LoaderCircle` spinner |
| complete | cyan border + 900ms confirm pulse; green `✓` in the summary line | button turns green; no pulse |
| agent chip | above the button, mono 10.5px, `letter-spacing: .05em`, faint, no border | below the button, bordered cyan pill |
| caption slot | `min-height: 66px`, `max-width: 460px`: request / helper / summary | no helper line; height varies by state |

The confirm pulse needs a restart-safe trigger. Do **not** use the mockup's
`void offsetWidth` reflow hack. Render `data-easy-button-confirm="true"` on the
button for 1000ms after the run first goes terminal; the attribute transitions
`false → true`, so the animation starts fresh on entry and cannot double-fire
within one terminal state.

The Stop button has no home in the mockup. Give the stage a fixed vertical
rhythm so nothing jumps: agent-chip slot (fixed) → button well (fixed) →
caption slot (`min-height: 66px`) → action slot (fixed 34px). Stop lives in the
action slot; the slot reserves its height in every state.

Parameterize the size once so the swirl tracks the button:

```css
--easy-button-well: clamp(132px, min(24vw, 24vh), 180px);
/* well: width/height: var(--easy-button-well)
   control: 100% of the well
   swirl:  inset: -100%  (→ 3× the well, automatically)
   blur:   calc(var(--easy-button-well) / 6)  (→ 30px at 180px) */
```

### Left rail

| | Mockup | Implementation |
| --- | --- | --- |
| marker | 6px dot; newest pulses cyan while working, green on complete | 1px left border bar |
| item | `grid-template-columns: 6px 1fr auto`, baseline-aligned | text stacked over time |
| age fade | `:nth-last-child(1..5)` → 1 / .72 / .55 / .42 / .35, base .3, 500ms transition | `[data-highlight-age]` — **never renders** (see Bug Found) |
| time | mono 11px, `tabular-nums`, `0:02` | 0.68rem, `+2s` / `+1m 3s` |
| label | "Now", 10px, `letter-spacing: .14em`, fades in with content | "Highlights", `letter-spacing: 0`, cyan-tinted, unmounted when empty |
| justify | `safe center` | `flex-end` |

Adopting `:nth-last-child` **deletes** the `age` prop and the `Math.min(...)`
computation from `HighlightRail`/`HighlightItem`. The mockup's approach is less
code, not more.

`safe center` (not plain `center`) matters: on an overflowing flex column,
plain `center` clips both ends and makes the top unreachable.

Rail labels must be *rendered but transparent* when their rail is empty, or
they cannot fade in. Copy: use the mockup's **"Now"** for the left rail.

Change `highlightElapsedLabel` to `m:ss`.

### Right rail

Overflow: replace the `::after` gradient overlay (which hardcodes the pane
background, and would need updating again under decision 1) with the mockup's
`mask-image: linear-gradient(to bottom, black calc(100% - 30px), transparent)`.
It is background-independent. Add the missing **"Artifacts"** rail label.

Cards: `--setta-875` on `--setta-750`, `padding: 12px 13px 13px`, arrival
`artifact-in 520ms cubic-bezier(0.22, 1, 0.36, 1)` (currently `220ms ease-out`,
`translateY(6px)` instead of `12px`). Kicker and title drop to the mockup's
10px/13px with `letter-spacing: .14em` on the kicker and `--setta-500` (not
cyan) for its color.

**Table:** borderless. `th` uppercase 10.5px `letter-spacing: .07em` weight 500
faint; `td` gets a top rule only, mono 11.5px muted; last column right-aligned;
non-first columns `tabular-nums`. Drop the wrapper border/radius, the `th`
background, and the full grid lines. *Keep* the `overflow-x: auto` wrapper and
the `max-width` / `overflow-wrap` cell guards — real data is nastier than the
mockup's four fixed rows, and neither changes rendering for reasonable data.

**Bar chart:** the mockup is a 92px right-aligned mono label beside an inline
bar, with the value trailing the bar. The implementation stacks a label row
above a full-width rounded track. Adopt the mockup:

```css
.a-bar-row   { display: grid; grid-template-columns: 92px 1fr; gap: 9px; align-items: center; }
.a-bar-track { display: flex; align-items: center; gap: 7px; }
.a-bar       { height: 9px; border-radius: 2px;
               background: linear-gradient(90deg,
                 color-mix(in oklch, var(--accent-cyan) 55%, transparent),
                 var(--accent-cyan)); }
```

The cyan→green fill gradient goes away (not in the mockup). Keep rendering
`{value}{unit}` — the contract has an optional `unit` the mockup's demo data
folded into its title.

### Footer

Pill (`border-radius: 999px`) on `--setta-925`, `padding: 0 12px 0 16px`,
focus ring `0 0 0 3px` at 10% cyan, with a decorative `aria-hidden` `⏎` chip.
Currently an 8px-radius box with no chip.

Keep the `<form>` and add an `.easy-button-input-wrap` inside it (the mockup
uses a bare `<label>`). Keep the current placeholder — the mockup's "or type
your request…" presumes the voice affordance above it, which does not exist.

## Animation Fidelity Strategy

Three tiers. The first is the gate, the second is a reviewable artifact, the
third is explicitly declined.

### Tier 1 — Parameter parity, asserted (the gate)

Everything about these animations except the current time is static and already
probeable: `easy-button-pane-driver.js` reads computed styles per element today
and the workflow asserts `buttonAnimationName === "easy-button-glow-breathe"`.
Extend the same probe rather than inventing a mechanism:

- **swirl** — resting `opacity` per state (0 / 0.85 / 0.2), `filter`, `maskImage`
- **swirl-inner** — `animationName` (`breathe`), `animationDuration` (`17s`)
- **each layer** — `animationName` (`spin-cw` / `spin-ccw`), `animationDuration`
  (`18s`/`29s`/`41s`; `54s`/`87s`/`123s` on complete), `animationPlayState`,
  `mixBlendMode: screen`, `opacity`
- **control::after** — `glow-breathe`, `5.5s` (already asserted; keep)
- **newest highlight dot** — `dot-pulse` while working
- **confirm pulse** — `animationName` present on entry to complete
- **artifact card** — `animationDuration: 520ms`,
  `animationTimingFunction: cubic-bezier(0.22, 1, 0.36, 1)`
- **highlight item** — `animationFillMode: none` and resting `opacity` per
  `:nth-last-child` position (the regression guard for the bug above)

### Tier 2 — Phase-pinned screenshots (deterministic, zero production code)

CSS animations are driven by the Web Animations API, so a test can pin them
without any test-only hook in the product:

```js
for (const anim of paneRoot.getAnimations({ subtree: true })) {
  anim.pause();
  anim.currentTime = t;   // subtree:true includes ::after pseudo-elements
}
```

Add `easyButtonPinAnimations(t)` to the driver, then reuse the existing
`captureScreenshot(client, path)` helper at a couple of fixed `t` values per
state, writing into `.recordings/…/pixel-match/`. Optionally load the mockup
HTML in the same renderer at the same well size, pin the same `t`, and capture
alongside for a side-by-side.

This is the whole answer to "how do we pixel-match an animation": pin time,
compare stills. It costs one driver function.

### Tier 3 — Declined: an image-diff CI gate

No `pixelmatch` / `pngjs` dependency, no image-hash gate. GPU blur, subpixel
antialiasing, and font rasterization vary by machine and driver, so such a gate
is flaky, and a flaky gate gets weakened or skipped — strictly worse than
having Tier 1. Tier 1 gates; Tier 2 is an artifact a human looks at once per
visual change.

## Performance

The swirl is the first genuinely expensive thing in this pane:
`filter: blur(30px) saturate(1.3)` over a ~540×540 CSS-px region whose three
`mix-blend-mode: screen` conic layers animate, so the blur re-rasterizes every
frame. The mockup's own notes flag this, and the shipped plan's Phase 5
deferred it — every existing performance report measured a pane with **no
swirl**, so there is no usable baseline yet.

- **Idle must stay free.** `opacity: 0` does not stop an animation; Chromium
  keeps ticking the rotations and compositing the layers. Pause the swirl
  layers and `breathe` at idle via `animation-play-state: paused`, and scope
  `will-change: transform` to the working state only. Assert both.
- Re-baseline with the existing focused workflow
  (`easy-button-pane-performance.test.mjs`, which already samples idle /
  working / frozen with frame metrics) before and after Phase B; append a report
  under `docs/reports/performance/`.
- Budget: p95 frame ≤ 16ms, zero long tasks, and no more than ~1ms p95
  regression against the current report (p95 9.3–9.7ms at 120fps).
- Mitigation ladder if it is hot — measured, in order, not assumed: scope
  `will-change` → shrink the blur radius → drop layer 3 → pre-blurred sprite or
  a single conic layer.

Freeze already works: the existing
`[data-surface-frozen="true"] … { animation-play-state: paused !important }`
rule covers the swirl's descendants unchanged. The swirl's `opacity` transition
is a transition, not an animation, so freeze does not pause it — harmless,
since it is finite.

**Accepted fidelity compromise.** Entering `complete` swaps each layer's
`animation-duration` (18s→54s, etc.). Chromium preserves `currentTime` across a
duration change, so the rotation *snaps* to a new phase rather than
decelerating as the mockup's comment intends. The mockup has the identical
artifact, and it is masked by the simultaneous 1600ms fade to `opacity: 0.2`.
Do not build a JS deceleration for this.

## Reduced Motion

The mockup keeps transitions and only kills animations; the implementation
blanket-kills both (`animation: none !important; transition: none !important`)
and the E2E asserts it. **Keep the implementation's stricter rule** — it is a
better accessibility answer and pixel-matching a media-query variant is not the
goal. Do match the mockup's reduced-motion *appearance*: the swirl stays
visible but static (`opacity: 0.5` while working), the glow rests at
`opacity: 0.4` with `transform: scale(1)`.

`assertReducedMotionVisual` currently requires the spinner element to exist in
the working state. Retarget it at the swirl.

## Phases

Two implementation commits, each independently green, plus a small test-only
commit. Ordering is chosen so **no commit ever ships a working state without an
indicator**, and so the spinner→swirl swap is atomic — no dual path exists at
any commit, per the no-compat directive.

### Phase A — Structure, tokens, rails, artifacts, footer

Everything except the center's motion. Keeps the ring and spinner exactly as
they are so the working state stays coherent.

- Pin the dark ladder; pane background `--setta-900`; retokenize per the
  mapping table; mono + `tabular-nums` on numerics.
- Restructure to the 3×2 grid; footer spans `1 / -1`.
- Introduce the button well and `--easy-button-well`.
- Caption slot + helper line; move the agent chip above the button; add the
  fixed action slot for Stop.
- Footer pill + `⏎` chip.
- Rails: `safe center`, `mask-image` overflow, always-rendered fading labels,
  "Now" / "Artifacts".
- Highlights: dot + baseline grid + `m:ss` + `:nth-last-child` cascade; delete
  `data-highlight-age` and the `age` prop; **remove the `both` fill mode.**
- Artifacts: card tokens, kicker/title scale, borderless table, inline bar
  chart, `artifact-in` easing; markdown/file styled in-idiom.
- Terminal states per the table above, keyed on `data-easy-button-status`;
  green `✓` prepended to the summary only when `status === "completed"`.
- Update the driver/workflow/perf assertions this changes.

Landed as `e392e23e1`, except the terminal-state split, which that commit got
wrong (it keyed the success visuals on `data-easy-button-state="complete"`).
Fixed in a follow-up. Its deterministic coverage must include a non-`completed`
terminal run that carries at least one highlight — no scripted run did, which
is why the green-dot-on-failure defect went uncaught.

### Phase B — The swirl (atomic replacement)

- Add `.easy-button-swirl` + core + three layers: keyframes, durations, easing,
  `mix-blend-mode`, mask, and blur ported verbatim and retokenized.
- State mapping: idle `opacity: 0` + paused; working `0.85` + running;
  complete `0.2` + stretched durations.
- **Delete `.easy-button-control-ring`, `.easy-button-spinner`, and the
  `LoaderCircle` import in the same commit.** Button dims and its glow stills
  while working, per the mockup.
- Reduced motion: swirl visible, static, `0.5` while working.
- Tier-1 swirl assertions; idle-paused assertion; freeze assertion.
- Performance re-baseline + report.

Landed. Report: `docs/reports/performance/easy-button-pane-phaseB-swirl-20260709.md`.
Every parameter matches the mockup, verified from the workflow's own recorded
state: `blur(30px) saturate(1.3)`, `breathe 17s`, layer periods `18s/29s/41s`
working and `54s/87s/123s` complete, `mix-blend-mode: screen`, opacity
`0 / 0.85 / 0.2`, paused at idle and under freeze, `will-change: transform`
scoped to working alone. Measured: 120fps, p95 8.7–8.9ms, zero long tasks and
zero frames over 16ms in idle, working, complete, and frozen. The mitigation
ladder was not needed.

Two things the implementation added beyond the plan, both correct:

- **A `complete` performance sample.** The terminal state is where the pane rests
  after every run — potentially for hours — and the swirl keeps rotating there
  without the `will-change` promotion. It was unmeasured. It costs the same as
  working.
- **A paint assertion.** The arms are relative colors (`rgb(from var(--token) r g
  b / a)`). If that ever fails to parse, the whole gradient declaration is
  dropped and the layer paints nothing, while every timing parameter still
  reports exactly what the stylesheet asked for — a silently empty field. The
  driver checks each layer's computed `background-image` still contains
  `conic-gradient`.

Sampling gotcha, now encoded in both workflows: the swirl crossfades over
1600ms, so any state read the instant a view state lands reports an interpolated
opacity that equals neither endpoint. Waits gate on the settled field.

### Phase C — Fidelity harness (tests only)

- `easyButtonPinAnimations(t)` in the driver.
- Phase-pinned captures per state into `.recordings/…/pixel-match/`.
- Optional side-by-side capture of the mockup in the same renderer.

## Verification

Per phase: `./scripts/format.sh`, `./check_quality.sh --git-changes`,
`pnpm -C desktop typecheck`, `pnpm -C desktop build`, the easy-run vitest
suites, and both Electron workflows —
`easy-button-pane-workflow.test.mjs` and
`easy-button-pane-performance.test.mjs`. `./check_quality.sh --all` before the
final commit.

Ownership follows the established split: Codex writes the code and verifies
lint / typecheck / vitest / builds; Claude runs the Electron E2Es and the full
gates, since Codex's sandbox cannot launch Electron.

No backend test changes are expected. If any Go test needs touching, that is a
signal the restyle has leaked past the renderer — stop and re-scope.

## Risks

- **Swirl cost.** The one real risk. Bounded by the measurement gate and the
  mitigation ladder above. Idle-pausing removes the steady-state cost entirely.
- **`--setta-900` against a `--setta-950` canvas.** Correct per the mockup and
  per decision 1, but it is the first pane to opt out of
  `--workspace-pane-surface`. If a second Easy Button-like surface ever appears,
  promote the ladder to a shared token set rather than copying it.
- **`mix-blend-mode: screen` + `filter` interaction.** `.swirl` carries a
  `filter`, which makes it a stacking context and an isolated group, so the
  layers screen-blend against each other and the core — not against the pane
  background. This is what the mockup does and why the swirl does not wash out.
  Do not remove the filter without also isolating the group.
- **Driver churn.** Roughly a dozen assertions across the workflow and
  performance tests reference `controlRing` / `spinner`. They are replaced, not
  deleted — the swirl gets strictly more coverage than the spinner had.
