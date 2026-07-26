# Artifact Composition Plan

**Date:** 2026-07-27
**Status:** Complete. Phases 1–4 landed 2026-07-27.

## Outcome

Artifacts look like `docs/mockups/artifact_concept.html`, approved 2026-07-27.

## Why the previous plan was not enough

`artifact-visual-language-plan.md` put artifacts on the command center's
palette, type scale, and box rules. That was necessary and it is done. It did
not make them good, because none of it was composition: a document with no title
block, no measure, and no rhythm reads as a settings pane whatever colour it is.

This plan is about the page, not the tokens.

## The gap, concretely

| | Now | Mockup |
| --- | --- | --- |
| Title | in the overlay bar, and again in the body | a title block the document owns; the bar keeps position and controls |
| Measure | full bleed to ~1200 px | 34 rem for prose, wider only for figures |
| Body | 13 px | 15 px / 1.62 |
| Section | a heading | a tracked label, space, and a hairline |
| Card | a bordered box | a rule and a label, like a margin note |
| Metric | a small label and a number | a stat band with tracked labels and tabular figures |
| Chart | flat saturated slabs | thin strokes with a gradient falloff on a hairline baseline |
| Rail card | a title and a fixed block of space | kind, title, one line, and the single most telling figure |

## Hard Rules

- The catalog contract does not change. This is renderer composition only; no
  new component, no new prop, nothing regenerated.
- The vendored shadcn source stays unedited (`components/ui/PROVENANCE.md`).
- No semantics inferred from text. An artifact's kind, its lead sentence, and
  its structure come from the document tree, never from matching words.
- Reading text is not chrome. The 15 px body is a deliberate departure from the
  shell's scale and is the point of the exercise, not a regression of it.

## Phase 1 — The reading surface

**Done.** The overlay's bar keeps position and controls; its title moves into a
title block at the top of the document, where a document's title belongs. The
`DialogTitle` stays as screen-reader text, because a dialog still has to be
named. Body type is 15 px on 1.62 leading, prose carries a 34 rem measure, and
the browser's outer width is the bound for figures rather than for text.

### Original phase text

The overlay stops competing with the document. Its bar keeps position and
controls; the document gets a title block built from `artifact.title`, and the
body is bounded to a measure with figures allowed to exceed it.

Body type goes to 15 px on 1.62 leading inside an artifact.

**Verification.** The gallery at every fixture; the artifact browser driven in
the command-center workflow.

## Phase 2 — Primitives that compose

**Done.** `Section` is a band — a tracked label over a rule — rather than
another bold line; rendering it as a heading is what made a document a flat run
of same-weight text. `Card` is a margin note: a rule and a tracked label, no
box, because the box was never the informative part. `Metric` grows to a 26 px
tabular figure with a 12 px note. `Table` and `Alert` were already at the
mockup's treatment from the previous plan.

### Original phase text

- `Section`: a tracked label above its content, with the hairline the mockup
  uses, instead of a plain heading.
- `Card`: a rule and a label — the mockup's margin note — rather than a box.
- `Metric`: the stat band. Tracked label, large tabular figure, faint note.
- `Table`: the mockup's rules and numeric column treatment.
- `Alert`: already a rule and a tint; align its padding and type to the mockup.

**Verification.** The gallery, read fixture by fixture.

## Phase 3 — Charts

**Done.** Recharts sizes bars to fill their band, which turned three data points
into three saturated blocks — the loudest thing on the page, and louder than the
canvas it sits beside. Bars now cap at 30 px, fill with a gradient falling to
22 % opacity at the baseline, and sit on grid lines at the Director border
colour and half opacity. The vendored chart container is untouched; all of this
is props in the Setta-owned `artifact-chart.tsx`.

### Original phase text

Bars become strokes: a maximum width, a gradient falling off toward the
baseline, a hairline axis, and grid lines at the mockup's weight. This is the
single loudest thing on an artifact today and the biggest visible win.

`artifact-chart.tsx` is Setta-owned; the vendored chart container is not
touched.

**Verification.** The gallery's chart, maximum-chart, and maximum-pie fixtures.

## Phase 4 — The rail card

**Done.** The card carries its kind as a kicker, now that `emit_artifact`
supplies one. The fixed preview reserve becomes a floor: it still keeps an
arriving preview from moving the card under the reader, but a card is otherwise
as tall as what it has to say. Reserving a block every card had to fill is what
made the rail a column of half-empty boxes.

### Original phase text

Kind, title, one line, and the most telling figure — or a sparkline where the
artifact has a series. The fixed preview reserve goes: a card is as tall as what
it has to say, and the rail stops being a column of half-empty boxes.

**Verification.** The command-center workflow's preview assertions, and the rail
read at the width it actually draws.

## Open question

**Where does an artifact's kind come from?** The mockup's kicker ("Story",
"Report", "Protocol") is the strongest single signal that these are different
kinds of document, and the catalog has no such field. Deriving it from content
shape would be inference the rules forbid. Either the catalog gains a typed
kind, which is a contract change and out of this plan's scope, or Phase 1 ships
the title block without a kicker and the question is answered separately.

## Phase 5 — The delta list, worked against the picture

**Done.** Phases 1–4 were verified component by component against tokens. That
is not the same as verifying the composition against the mockup, and the gap
survived all four. Driving `docs/mockups/artifact_concept.html` and the app at
the same viewport and reading computed styles off both found it in one pass.

| | Mockup | App, before | Now |
| --- | --- | --- | --- |
| Body | 15px / 1.62 | **13px / 1.5** | 15px / 1.62 |
| Block rhythm | 24–30px | 18px | 26px |
| Section heading | 17px | 14px | 17px |
| Stat figure | 30px, −0.02em | 26px, plus a tone icon | 30px, −0.02em, tone as colour |
| Callout | tint fading out by 70% | flat 6% wash, full width | gradient, 52rem |
| Chart | 150px plot, values above bars, baseline only | 256px, Y axis, grid | single series takes the mockup's plot; multi-series keeps its axis |
| Code, file pointer | — | bordered slabs at full width | leading rule at 52rem |
| Tracked labels | `--faint` | `--muted-foreground` | `--faint` |
| Title block kicker | accent tick + kind | kind only | accent tick + kind |
| Rail card kind | the artifact's accent | muted grey | `--director-primary` |

**Body type was the headline.** The mockup's premise is one sentence — reading
text is not chrome, so it sits at 15px on a bounded measure — and it was the one
thing never implemented. Phase 1 of this plan set it; Phase 3 of
`artifact-visual-language-plan.md` then set the document to the shell's 13px to
match the surface around it. The later phase won silently, and every later
verification checked the result against the shell rather than against the page.
That is the whole failure, and it is why "matches the tokens" is not a passing
grade for a composition.

**Two rules stacking is why the file pointer changed.** The margin-note device —
a rule above a tracked label — collides with itself: a title block's rule and a
`FileReference`'s rule an line apart read as a mistake. Blocks that lead a
document carry the rule on their leading edge instead, which cannot collide.

**A natively routed artifact had no kind.** `emit_artifact` requires one, but an
image the provider saved into the workspace becomes an artifact through
`service_agent_progress.go`, which set none — so the new title block drew its
accent tick against an empty string. That route now names its kind, which is a
fact about the activity that produced it and not an inference from content.

**Not done, and it needs a contract field.** The mockup's standfirst — the
muted line under the title, above the rule — has no source. `WorkstreamArtifact`
carries a title and a kind and nothing else, and taking the document's first
paragraph would be positional inference the rules reject. It is the last
title-block delta.

**Verification.** `docs/mockups/artifact_concept.html` and the gallery driven in
Electron at 1400×980 and read side by side; every fixture screenshotted; the
artifact browser and rail driven through the command-center workflow; 693
renderer unit tests, `internal/conversation` Go tests, typecheck, eslint, knip,
prettier, production build, and the `director-command-center` and
`native-artifact-routing` Electron workflows.

## Phase 6 — The rail card, and the field it needed

**Done.** The mockup's card is a kind, a title, one line about the artifact,
and the single most telling thing inside it. Three of those the app had. The
line it did not, and that is why the rail still looked worse than the mockup
after Phase 5: with nothing authored to say what an artifact *is*, the card
fell back to a bounded replay of the document's opening — which for an image
artifact was a monospace file path, and for a report was the first sentence of
the thing you were deciding whether to read.

**The contract gained `summary`.** One sentence, required on `emit_artifact`,
bounded at 220 bytes and rejected if it carries a line break, because a
standfirst is one line. It is threaded through `Artifact`, `ArtifactMetadata`,
`TrajectoryArtifactEmitted`, and `WorkstreamArtifact`; protocol version 107.
The tool instructions ask for a claim about the document rather than its
opening line. The native image route supplies its own, as it does its kind.

It pays for itself twice: it is the rail card's line and the browser's
standfirst — the last title-block delta Phase 5 could not close.

**The bounded preview projection is gone.** `ArtifactPreviewSurface`,
`artifact-preview-projection`, and `artifact-preview-blocks` existed to render
a shrunken document: prose excerpts, Markdown flattening, a two-row table, three
code lines, status chips, file rows, and the ranked block selection that chose
between them. None of that is what a card is. What replaced them is
`artifact-card-projection` and `ArtifactCardFigures`: the document's first
metric and its first chart series, drawn as a figure and one static sparkline.
Everything else in the catalog contributes nothing to a card, and says so.

**Two things the mockup taught twice.** A spark bar sized to fill its band is
40px wide on a stretched plot — the same slab the document's chart drew before
Phase 5 capped it — so the card caps its bars in viewBox units. And a card's
figure leads with the value and follows with a tracked caption, because the
number is what the eye lands on.

**One delta left, and it is deliberate.** The mockup gives each card its own
accent, drawn from the graph's modes. Nothing about an artifact says which mode
it belongs to, so every card spends the Director's primary instead. Picking a
colour per card without a source would be decoration.

**Verification.** The command-center rail driven in Electron and read against
the mockup's card; 690 renderer unit tests including a rewritten card
projection suite; the whole Go suite; typecheck, eslint, knip, prettier,
production build; and the full required Electron workflow tier
(`director-command-center`, `director-command-center-local-voice`,
`native-artifact-routing`, `microphone-permissions`).
