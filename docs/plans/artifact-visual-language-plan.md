# Artifact Visual Language Plan

**Date:** 2026-07-27
**Status:** Complete. Phases 0–4 landed 2026-07-27.

## Outcome

An artifact looks like it belongs to the Director command center, because it is
drawn from the same palette, the same type scale, and the same rules about what
gets a box.

## The problem

The command center and the artifacts are two products.

The command center never reads the appearance setting. Its CSS contains no
theme variable at all — the palette is literal `oklch()` values, fixed dark,
matching `docs/mockups/fullscreen_conversation_concept.html`.

The artifact catalog is a themed shadcn app. Its components are written in
`text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, and
`var(--accent-*)`, all of which the appearance store rewrites on `:root` when
the mode changes (`appearance-store.ts:182`).

So an artifact is a light-or-dark document embedded in a permanently dark
canvas. The seam is visible wherever the two meet, and it is load-bearing: the
artifact preview in the rail must paint its own themed background, because
without it the catalog's theme-token text would render dark on a dark card in
light mode. That background is what makes a rail card read as a box inside a
box, and it cannot simply be deleted while the coupling exists.

Colour is only the part that forced a workaround. Side by side, the rest:

| | Command center | Artifacts |
| --- | --- | --- |
| Palette | fixed dark `oklch()` | shadcn tokens, mode-dependent |
| Type scale | explicit 10/11/12/13 px | browser-relative shadcn sizes |
| Kickers | 10 px uppercase, 0.14 em tracking | none |
| Boxes | artifacts and pending actions only | nearly everything |
| Status colour | graph modes (cyan/violet/amber/green/red) | shadcn status tokens |
| Vertical rhythm | 8–18 px | roughly double |

The duplicated title is the same failure in miniature: the browser header names
the artifact and then the document names it again, because neither surface knows
what the other says.

## Decision

**Artifacts are always dark.** They stop reading the appearance setting and
adopt the command center's palette.

Recorded from the product owner, 2026-07-27: light mode is never used, and it
stays only for the settings pages. So the mode-following behaviour in the
artifact path is not a feature being removed — it is a divergence that never
paid for itself, and it is what forces the theme island.

## Hard Rules

- No compatibility layer. Theme-token usage in the artifact path is replaced,
  not kept alongside a dark override; there is no artifact theme switch.
- The Go-owned catalog contract is untouched. `artifact-catalog.ts` and friends
  are generated from `cmd/generate-artifact-catalog` and describe component
  names and props, not appearance. This plan is renderer-only.
- No new dependency. No CSS framework, no theming library, no icon set.
- The appearance setting keeps working for the settings pages. This plan removes
  artifacts from its scope, not the setting.
- One source for the palette. The point of the work is to stop having two; do
  not fix the seam by copying the shell's literals into the artifact components.

## Phase 0 — A surface that shows every primitive at once

The catalog has ten conformance fixtures covering content blocks, layout
containers, data display, charts, references, a mixed report, skipped slots,
syntax edges, and a maximum table
(`src/renderer/src/features/artifacts/generated/conformance-corpus/`). They are
used by unit tests and never rendered anywhere a person can look.

Add an artifact gallery entry that renders all ten, mirroring the existing
`director-graph-gallery.html` entry point. Every later phase is judged on it,
and it is the only way to see a catalog-wide change without hunting for an
artifact that happens to use a `PieChart`.

**Verification.** The gallery loads every fixture without a renderer error.

## Phase 1 — Name the command center's palette

**Done.** `director-palette.css` defines the neutral scheme on `:root` — ground,
surface, card, bright, foreground, muted, faint, border, card border, primary,
and the Director's role accent — and the five command center stylesheets plus
`director-graph.css` now read it. Alpha variants use relative colour syntax
(`oklch(from var(--director-ground) l c h / 0.86)`) so they are identical to the
literals they replace by construction rather than by arithmetic.

Tokens live on `:root` rather than on the command center, because the graph
surface is also mounted by the gallery and the measurement harness, neither of
which has a command center above it.

**The mode colours did not move, and the plan was wrong to assume they could.**
It said to read them from `graph-visual-language.ts`, which owns them for the
shaders. Measured, the rail's CSS approximations of those colours differ from
the shader's by as much as 0.08 in lightness and 32 degrees of hue:

| Mode | Shader | Rail CSS | Δ |
| --- | --- | --- | --- |
| think | `oklch(0.79 0.12 222)` | `oklch(0.72 0.13 220)` | ΔL 0.07 |
| do | `oklch(0.66 0.20 295)` | `oklch(0.72 0.12 292)` | ΔC 0.08 |
| success | `oklch(0.87 0.18 156)` | `oklch(0.80 0.15 152)` | ΔL 0.07 |
| fail | `oklch(0.67 0.22 19)` | `oklch(0.70 0.16 25)` | ΔC 0.06 |
| merge | `oklch(0.94 0.05 218)` | `oklch(0.86 0.04 250)` | Δh 32 |
| listening | `oklch(0.90 0.06 233)` | `oklch(0.82 0.08 210)` | Δh 23 |

Unifying them is a visible change and belongs to Phase 4, where status tone is
already in scope — not to a phase whose whole value is that it changes nothing.

**Verified.** Computed styles for every node under the command center, captured
from a driven Electron session before and after: identical across all 86 nodes.
Screenshots cannot show this, because the drifting field never repeats between
launches — a naive pixel diff reports 41 % of pixels differing with a worst
channel delta of 7, all of it particle noise.

### Original phase text

The shell's colours are literals repeated across
`director-command-center.css`, `director-command-center-composer.css`,
`director-command-center-navigation.css`, `director-command-center-activity.css`,
and `director-graph.css`. Artifacts cannot adopt them while they are spelled out
in forty places.

Extract them into custom properties on the command center root — ground,
surface, panel, foreground, muted, faint, border, primary, and the five graph
mode colours already defined in `graph-visual-language.ts`. The mode colours are
owned by the graph and must be read from there rather than re-typed, so the
canvas and the artifacts cannot drift.

This phase changes no pixels. It is the enabler, and it is separately
verifiable *because* it changes no pixels.

**Verification.** Screenshot parity on the command center before and after;
the Electron `director-command-center` workflow.

## Phase 2 — Artifacts adopt the palette

**Done.** Not by rewriting the catalog's components, which may not be edited for
Setta behaviour: `artifact-surface.css` maps the shadcn token *names* the
vendored source is written in — `--background`, `--card`, `--muted`, `--border`,
`--foreground` — onto the Director's palette inside `.setta-artifact`. The names
are the contract; what they resolve to is not.

**The two palettes were never two systems.** The mockup's colours turned out to
be the Go-owned Setta scale, rounded: ground is `--setta-950`
(`0.128 0.007 261` against `0.1281 0.0070 261.32`), surface is `--setta-925`,
border is `--setta-750`, muted is `--setta-300`. That is why an artifact could be
moved onto the Director's palette by renaming rather than by re-picking colours,
and it is the reason the seam was always narrower than it looked — what read
as two products was mostly ground level, typography, and boxes rather than hue.

The theme island is deleted, as the phase promised. Its readability assertion is
rewritten rather than removed: it now walks up to the first ancestor that
actually paints and compares the preview's text against that, so it still fails
if text and ground resolve to the same colour — with no assumption that the
preview owns a background.

**Verification.** `director-command-center` Electron workflow, the gallery
driven and read at the data-display fixture, 691 renderer unit tests, typecheck,
eslint, knip, production build.

### Original phase text

Replace theme tokens in `artifact-layout.tsx`, `artifact-content.tsx`,
`artifact-data.tsx`, `artifact-table.tsx`, `artifact-chart.tsx`, and
`ArtifactPreviewSurface.tsx` with the Phase 1 properties.

Then delete the theme island: `.director-artifact-preview-viewport` loses its
background, radius, and padding, and the summary sits directly on the card. That
deletion is the proof the coupling is gone.

**This phase changes an E2E contract.** `assertDirectorArtifactPreviewTheme`
currently asserts the preview follows the mode, and
`director-command-center-workflow.test.mjs:499–550` drives light and dark to
check it. The new expectation is the opposite: the preview is the same dark
surface in both modes, and readable in both. Rewrite the assertion to state
that, rather than deleting it — the risk it guards (an unreadable preview) is
real and is exactly what a botched version of this phase would produce.

**Verification.** The rewritten appearance assertions; the gallery in both
modes; `director-command-center` workflow.

## Phase 3 — Type scale and rhythm

**Done.** The catalog was written in Tailwind's t-shirt sizes, which are
browser-relative and land a step above the shell's; that is what made an
artifact read larger and looser than the surface holding it. It now uses the
shell's explicit scale: 14 px section headings, 13 px body, 11 px captions, and
10 px kickers tracked at 0.14 em. Markdown headings inside a document answer to
the same scale, so a model's `##` cannot outrank a `Section`. The document gap
halves from 24 px to 18 px and section gaps from 12 px to 10 px, inside the
shell's 8–18 px range.

**One declared exception.** The plan said nothing in an artifact outranks the
command center's own title. A metric is the one thing that legitimately does —
its whole job is to be the number read first — so it keeps a larger size, 20 px
rather than the browser-default 24 px it had.

**The duplicated title is not a rendering defect and was left alone.** The
renderer already declines to draw the artifact title, and says so: the model's
top heading rank starts one level below it. The repetition in a real artifact is
the *model* authoring a `Heading` that restates the title it was given. That is
an authoring instruction to fix, and removing it in the renderer would mean
string-matching content against chrome, which the plan's own rules reject.

**Verification.** `director-command-center` Electron workflow, the gallery driven
and read at the mixed-report fixture, 691 renderer unit tests, typecheck, eslint,
production build.

### Original phase text

Adopt the shell's explicit scale: 10 px uppercase kickers with 0.14 em tracking,
11 px meta, 12.5–13 px body, and one step above that for a document title.
Nothing in an artifact is larger than the command center's own title.

Halve the vertical rhythm to the shell's 8–18 px range. The current gaps are
what make a short artifact feel like an empty page.

Remove the duplicated title: the artifact browser header names the artifact, so
the document body starts at its first real content.

**Verification.** The gallery at the reviewed viewports; `better-typography`
review of the resulting scale.

## Phase 4 — What gets a box

**Done.** `Alert` is a leading rule and a tint instead of a bordered panel — the
frame was the least informative thing about a callout. `Card` keeps a hairline
and loses its fill, because the document already sits on the Director's ground
and a fill per card is what stacked boxes on boxes. `Badge` is a hairline chip at
the shell's weight. `Metric` needed nothing: it already had no container.

**Status now reads the graph.** `graph-mode-css.ts` derives CSS custom
properties from `graphModeColor`, the same table the shaders paint from, and the
app and both galleries publish them on the document root. The artifact tones and
the Now rail's activity dots read those variables, so a failing artifact and a
failing node are the same red rather than two hand-matched approximations — the
old ones were out by up to 0.08 lightness and 32 degrees of hue. A unit test
pins the conversion, which is what keeps them from drifting again.

**Verification.** `director-command-center` Electron workflow, the gallery driven
and read at the data-display fixture, 693 renderer unit tests, typecheck, eslint,
knip, production build.

### Original phase text

Apply the command center's rule: a card is for a thing with edges — a produced
artifact, a question the user must answer. Prose, headings, metrics, and list
items are not boxes.

In catalog terms: `Card` keeps a hairline and loses its fill; `Alert` becomes a
rule-and-tint rather than a bordered panel; `Badge` matches the shell's chip
weight; `Table` keeps hairline row rules and drops its outer border; `Metric`
loses its container entirely. Status tone maps to the graph's mode colours, so a
failing artifact and a failing node are the same red.

**Verification.** The gallery; a screenshot pair against the command center at
each reviewed viewport, which is the actual question this plan exists to answer.

## Open questions

1. **Does the artifact browser overlay stay full-bleed?** It currently fills the
   window with a wide measure. The shell's reading surfaces are bounded columns.
   Deferred to Phase 3, where the measure gets set.
2. **Does light mode survive at all?** With artifacts out of its scope it
   applies only to settings pages. Removing it entirely is a smaller change than
   keeping it half-used, and worth asking once this plan lands.
