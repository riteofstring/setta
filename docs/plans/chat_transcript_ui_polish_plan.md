# Chat Transcript UI Polish Plan

## Goal

Improve the chat transcript so active reasoning feels alive, assistant markdown
renders correctly, and tool-call noise is collapsed by default without returning
to the bulky outer Activity accordion.

This is a renderer-focused follow-up to the chronological transcript work. The
backend already owns typed transcript blocks and run chronology; this plan keeps
that contract intact and changes how the renderer presents those blocks.

## Product Contract

- Live reasoning/status headline text may show a subtle shimmer while the run is
  active.
- The shimmer must be CSS-driven, reduced-motion aware, and scoped to live
  headline text only. It must not add per-frame React state, timers, or animation
  work to every transcript row.
- Assistant markdown must render common model output correctly: paragraphs,
  lists, nested lists, headings, blockquotes, inline code, fenced code blocks,
  tables, links, emphasis, and hard line breaks where markdown semantics require
  them.
- Markdown rendering must not trust raw HTML from the model.
- Links must use an explicit safe click policy inside Electron. The renderer
  should not let arbitrary model-provided links navigate the app surface.
- Adjacent activity/tool-call blocks must be represented by a slim group header.
- Activity groups are collapsed by default as soon as the first activity row in a
  group appears, including while the run is still active.
- While a group remains collapsed, newly arriving activity rows update only the
  group header count/status/title preview. They must not insert visible rows
  below the header and cause transcript churn.
- If the user expands a group, member rows may stream in normally inside that
  expanded area. That shift is explicit user state, not default transcript
  behavior.
- Search, deep-link focus, and explicit row focus must be able to reveal the
  relevant hidden activity row.

## Non-Goals

- Do not change Go-owned transcript block contracts unless implementation proves
  the renderer cannot express the behavior from existing typed blocks.
- Do not reintroduce the old heavy outer Activity accordion from `setta-3`.
- Do not make the renderer infer grouping from raw provider text, tool names,
  shell commands, or keyword heuristics.
- Do not add polling to detect markdown, activity, or status changes.
- Do not manually edit generated outputs.
- Do not implement raw HTML rendering for assistant markdown.
- Do not add compatibility shims for older transcript shapes.

## Current State

The current transcript renderer has three useful foundations:

- Chronology is already represented as ordered `TranscriptBlock` records.
- Activity grouping is already derived as render-only metadata from adjacent
  typed `activity_item` blocks.
- The transcript uses `react-virtuoso`, so the visible row count stays bounded.

The main gaps are presentation-level:

- `MarkdownText` is a small hand-written parser. It only recognizes fenced code,
  inline code, and bold text, so normal markdown lists and links render as plain
  text.
- The live `Working`/reasoning indicator is static text plus a braille spinner.
  The spinner animates through React state; the label itself does not animate.
- The activity group slot reserves a tiny hover bulk-toggle affordance, but it
  does not collapse the member rows. That keeps every tool call visible by
  default.

The old `setta-3` implementation had a real outer `<details>` group around run
activity. It solved noise, but the wrapper was visually heavy because it carried
top border, padding, icon, disclosure icon, count badge, label, and status. The
new design should keep the slim current feel while restoring default collapse.

## Design Direction

### 1. Live Headline Motion

Introduce a small reusable renderer primitive, tentatively:

```tsx
<LiveHeadlineText active>{label}</LiveHeadlineText>
```

Use it only for live reasoning/status headline text:

- live reasoning headline rows;
- the live run-status headline when the run has no richer public reasoning row.

The implementation should be CSS-only:

- `background-image: linear-gradient(...)`;
- `background-size` and `background-position` animation;
- `background-clip: text`;
- `color: transparent` only while animation is enabled;
- `@media (prefers-reduced-motion: reduce)` fallback to normal text color.

Do not animate completed rows, tool titles, code, markdown body text, or every
spinner label. If the text is empty, render nothing special.

Performance expectations:

- No `setInterval`, `requestAnimationFrame`, or React state for the shimmer.
- No per-character spans.
- No measuring text width.
- The animation applies to a small number of live rows, usually one.

### 2. Markdown Rendering

Replace the local parser with a real markdown renderer rather than extending the
current regex-based parser feature by feature.

Recommended direction:

- Add a pinned markdown renderer dependency and GFM support dependency.
- Keep direct dependency versions exact and update the lockfile through the repo
  dependency workflow.
- Render raw HTML as text or skip it; do not enable raw HTML.
- Route code blocks through the existing `highlightCode` helper so syntax
  highlighting stays centralized.
- Provide explicit component renderers for `p`, `ul`, `ol`, `li`, `blockquote`,
  `pre`, `code`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, and headings
  so layout stays compatible with the dense chat surface.
- Keep wrapping constraints that prevent long tokens, paths, URLs, and code from
  overflowing the chat column.
- Use memoization at the `MarkdownText` boundary so unchanged completed assistant
  blocks do not reparse.

Link policy should be explicit:

- Allow safe external `http:` and `https:` URLs through `window.setta.app.openExternalUrl`.
- Treat unsupported schemes as inert text or a non-clickable styled span.
- Do not open `file:` URLs directly from markdown.
- Local absolute path links may be rendered visually as links only if a separate,
  typed app action exists for opening or revealing files safely. Otherwise render
  them as plain text for now.

Streaming behavior:

- The renderer may reparse the currently streaming assistant block as text
  changes.
- Completed blocks should be stable and memoized.
- Avoid chunking markdown text across arbitrary character boundaries when the
  text contains markdown syntax; chunking can break parser state and produce
  invalid output.

### 3. Slim Collapsed Activity Groups

Keep grouping as derived renderer state over adjacent typed `activity_item`
blocks. Do not persist a wrapper block.

Change the render row model from:

```text
activity-group slot
activity item
activity item
activity item
```

to the collapsed default:

```text
activity-group header
```

When expanded:

```text
activity-group header
activity item
activity item
activity item
```

Group state:

- Store expanded group IDs in `ChatTranscript`, keyed by the stable derived group
  ID.
- Default every new group to collapsed.
- Preserve user expansion/collapse while the group ID remains stable.
- Force a group open when a search result, deep link, or focused source run item
  targets one of its members.
- Bulk expand/collapse remains possible from the header, but it should operate at
  the group level first. Individual row expansion remains separate for row
  details/output.

Group header content should stay slim:

- chevron icon;
- compact activity count;
- aggregate status icon/spinner/check/failure marker;
- concise title preview from the first or active member;
- optional `+N` count for hidden additional rows.

Avoid:

- outer card styling;
- nested cards;
- border-top section wrappers;
- large badges;
- repeated "Activity" labels;
- rendering hidden row DOM.

Aggregate status should be deterministic from typed activity statuses:

- failed if any member failed;
- cancelled if any member cancelled and none failed;
- running if any member is pending or running and none failed;
- completed otherwise.

Title preview should use existing typed activity display labels. Do not parse raw
commands in the renderer.

## Implementation Phases

### Phase 1: Motion Primitive

- Add a `LiveHeadlineText` component or equivalent local primitive.
- Add minimal CSS in the shared renderer stylesheet.
- Apply it only to live reasoning/status headline text.
- Add component or render-string coverage that verifies reduced-motion class or
  data attributes are present without changing transcript structure.

### Phase 2: Markdown Renderer

- Add exact pinned markdown dependencies and update the lockfile with the repo
  dependency workflow.
- Replace the hand parser while preserving the `MarkdownText` public component.
- Keep existing `highlightCode` usage for fenced code.
- Add tests for lists, nested lists, links, headings, tables, raw HTML escaping,
  long tokens, and fenced code highlighting.
- Verify a representative assistant response renders markdown links/lists as
  DOM structure rather than literal markdown text.

### Phase 3: Collapsed Activity Groups

- Extend `TranscriptRenderRow` so an activity group row knows whether it is
  expanded and can suppress or emit member rows accordingly.
- Move activity group expanded state to group IDs while preserving per-row
  detail expansion state by block ID.
- Replace the tiny group slot with a slim group header component.
- Default new groups to collapsed, including active groups.
- Force-open groups for focused/search-targeted activity members.
- Keep virtualization bounded by not rendering hidden activity rows.
- Add row-model tests for collapsed default, expanded output, live member
  arrival while collapsed, split groups, and focus-forced expansion.

### Phase 4: E2E Verification

Because this touches transcript UI and chat workflow presentation, run focused
renderer tests first, then the deterministic Electron chat workflow through the
production Electron/main/preload/renderer/HTTP/store path.

Minimum checks:

```bash
pnpm -C desktop test -- src/renderer/src/components src/renderer/src/lib
./scripts/test_chat_workflows.sh --deterministic-only
```

Before committing implementation changes, also run the repo default gates:

```bash
./scripts/format.sh
./check_quality.sh --git-changes
```

If dependencies are added or lockfiles change, run:

```bash
./scripts/check_supply_chain.sh
```

For this plan document alone, automated implementation checks are not required;
inspect the diff.

## Performance Risks and Guardrails

### Markdown

Risk: a full markdown renderer can do more work than the current parser.

Guardrails:

- Keep transcript virtualization.
- Memoize parsed markdown by component props.
- Avoid reparsing hidden collapsed activity rows because they should not be in
  the DOM.
- Do not syntax-highlight every render of unchanged code blocks.
- Use focused performance tests if large streamed markdown becomes a bottleneck.

### Motion

Risk: text shimmer can create paint work.

Guardrails:

- Scope shimmer to live headline text only.
- Implement it as one CSS background animation, not per-character spans.
- Respect reduced motion.
- Avoid applying filters or shadows to large text bodies.

### Activity Groups

Risk: changing row emission can break scroll anchoring or search indexing.

Guardrails:

- Keep stable group row keys derived from the first member block ID.
- Keep hidden member rows out of the virtual row list when collapsed.
- Preserve the existing per-block detail/output cache.
- Ensure search/deep-link targeting forces the relevant group open before
  scrolling.
- Test older pagination prepends and active pinned scrolling after row-model
  changes.

## Open Questions

- Should the collapsed group header preview show the first member, latest member,
  or currently running member? Recommended default: currently running member when
  present, otherwise first member.
- Should completed groups remember their expanded state across app reload?
  Recommended default: no; expansion is view state, not persisted transcript
  state.
- Should local file-path markdown links become app actions later? Recommended
  default for this implementation: render as safe text unless a typed open-file
  action already exists.

