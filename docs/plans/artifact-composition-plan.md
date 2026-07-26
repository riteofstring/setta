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
