# Callable/Dict Section DOM and CSSOM Analysis

Date: 2026-04-25
Area: frontend
Branch/Commit: go-rewrite-dom-simple at ad4470668
Related PR: n/a

## Goal

Compare the current production callable/dict section path against the flat HTML/CSS prototype, with emphasis on DOM size, CSS selector/class complexity, layout reads, and pan/zoom repaint risk.

## Scenario

- Production code paths inspected:
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `frontend/src/components/Section/Layouts/CallableArea.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.tsx`
  - `frontend/src/components/Section/SectionParts/Search.tsx`
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
  - `frontend/src/components/Params/*`
- Prototype route measured:
  - `http://127.0.0.1:5174/internal/flat-section-prototype`
- Browser + OS:
  - Chrome via chrome-devtools MCP on Linux, Vite dev server
- Notes:
  - Prototype numbers below are live DOM/CSSOM measurements.
  - Production numbers are static code-path signals and source-derived row-shape analysis, not a live project trace. A live pan/zoom trace still needs a representative project with many callable/dict sections.

## Current Production Path

Callable renders through:

`SectionContainerCore -> SectionContainerCoreResizable -> SectionHeader + CallableArea -> SectionSearch + KwargsControls + ParamGroupContainer`

Dict renders through:

`SectionContainerCore -> SectionContainerCoreResizable -> SectionHeader + DictArea -> KwargsControls + ParamGroupContainer`

The current path includes several expensive features in the default section surface:

- Re-resizable section wrapper and resize handles.
- Header title/menu/control buttons, with measured header height.
- Callable function field backed by `TextInputCodeMirror`.
- Args/entries controls and filter, including a `ResizeObserver` height measurement.
- `ParamGroupContainer` with edge strip, pinned area, unpinned scroll area, measured fixed heights, and per-area observers.
- Per-param `useSortable` path, even when dnd is disabled.
- Per-row resize handle chrome.
- Param key and value fields backed by `TextInputCodeMirror`; on focus, real CodeMirror DOM mounts.
- React Flow handles for edge input/output rows.

## Static Complexity Signals

The production scan used the hot callable/dict section path plus shared row/header/resize files. The prototype scan used the flat prototype component, CSS, and preview page.

| Signal | Current production path | Flat prototype path |
| --- | ---: | ---: |
| Files scanned | 33 | 3 |
| Lines scanned | 13,946 | 1,076 |
| JSX tag candidates | 488 | 52 |
| `className` occurrences | 165 | 31 |
| `dark:` / dark selector hits | 236 | 6 |
| hover/focus/active selector hits | 207 | 14 |
| transition/animation hits | 80 | 0 |
| grid/subgrid/layout-grid hits | 104 | 0 |
| layout read / observer hits | 41 | 0 |
| dnd/resize/handle hits | 194 | 0 |

These are not runtime DOM counts. They are useful because they show where repeated selector matching, layout measurement, grid layout, dnd, resize, and handle machinery enter the hot path.

## Prototype Runtime DOM

Measured with Chrome on the collapsed/default prototype, with args controls hidden and unmounted:

| Prototype card | Elements | Class tokens | Inline styles | Grid descendants | Flex descendants | Pseudo before/after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Callable, dark | 35 | 58 | 0 | 0 | 15 | 9 / 5 |
| Dict, dark | 31 | 53 | 2 | 0 | 13 | 6 / 4 |
| Callable, light | 35 | 58 | 0 | 0 | 15 | 9 / 5 |
| Dict, light | 31 | 53 | 2 | 0 | 13 | 6 / 4 |

Four-card gallery total: 135 gallery elements. Full document total: 210 elements.

Opening one callable args control bar adds 13 elements, bringing that callable card from 35 to 48 elements. Since the intended default is hidden/unmounted, those 13 elements should not count against pan/zoom steady state.

Flat prototype CSSOM:

- 66 prototype CSS rules.
- 3,759 total prototype selector characters.
- 6 hover/focus prototype rules.
- Theme is handled with CSS variables on the card root, not `dark:` utilities on every child.

## Row Shape

Prototype row:

- `li`
- `b` key
- `code` value
- optional pseudo-elements for borders/rails

Current production text-like kwarg row usually includes:

- `article[data-param-row]`
- key `TextInputCodeMirror` dummy DOM, plus underline
- value `TextInputCodeMirror` dummy DOM, plus underline
- resize handle wrapper and inner hit target
- sortable row attributes/listeners/style path
- optional error icon/bubble
- nested child wrapper when the row has children

When the key/value field is focused, the real CodeMirror tree mounts, which is much larger than the dummy static render. That does not mean CodeMirror should be removed from editable fields, but it means the non-editing display path should stay as cheap as possible.

## CSSOM and Theme Cost

Tailwind itself is not the core runtime bottleneck; utilities are generated at build time. The runtime cost comes from how many class tokens and selectors each section carries, especially when repeated hundreds or thousands of times.

Current hot path concerns:

- Many `dark:` and arbitrary variable utilities are repeated across rows.
- `group-hover`, `peer-focus`, `transition-*`, rings, outlines, and shadow classes create more selector work and more paint states.
- CSS.gg icons use pseudo-elements, which are fine in moderation but add extra styled boxes on every icon.
- Inline `gridTemplateColumns` on rows and `style` props for dnd/resize mean the browser has more per-element style/layout work.

Prototype advantages:

- One namespace with reusable component CSS.
- CSS variables for theme and dimensions.
- No Tailwind utility chains in the row hot path.
- No grid/subgrid.
- Hover effects are one class rule on the row.
- Borders, rails, labels, and ports are mostly pseudo-elements.

## Pan/Zoom Repaint Risk

In React Flow, ideal pan/zoom is a compositor transform of the viewport. The section DOM still matters because the compositor has to move and raster cached content, and style/layout invalidation during viewport interaction can force main-thread work.

Production repaint/layout risk:

- Many nested DOM nodes per visible row increase raster area and style recalculation work.
- CodeMirror dummy/real fields add nested line/span DOM and many editor styles.
- Grid/subgrid is not automatically bad, but current rows use nested grids, `gridTemplateColumns`, and measurement hooks. That makes resize/filter/content changes more expensive and increases the chance of forced layout outside pure pan.
- Multiple `ResizeObserver`, `MutationObserver`, `offsetHeight`, `offsetWidth`, `scrollHeight`, `getComputedStyle`, and `getBoundingClientRect` paths exist in the current section stack.
- Row hover/selection transitions, handle transitions, shadows, rings, and outlines are paint-state multipliers when many nodes are visible.
- `viewportInteractionActive` currently adds `willChange: transform`, `translateZ(0)`, `backfaceVisibility`, and `isolation` on section shells. This can help compositing, but applied to many sections it can increase layer memory/management overhead. It should be profiled on a large real project.

Prototype repaint/layout profile:

- Rows are flex, fixed-height, and data-driven.
- No grid layout in the measured prototype.
- No runtime layout reads/observers in the prototype code.
- No transitions/animations in the prototype scan.
- Pseudo-elements provide visual hierarchy without DOM nodes.
- Hidden args controls do not exist in steady-state DOM.

## Interpretation

The prototype is materially simpler for the default visible state. The biggest wins are not from absolute positioning; they are from:

- Keeping controls unmounted until explicitly revealed.
- Moving repeated visual styling from Tailwind utility chains into a small CSS namespace.
- Replacing wrapper-heavy row structure with semantic row elements.
- Using CSS variables for dimensions/theme.
- Avoiding grid/subgrid in row layout unless a specific behavior requires it.
- Using pseudo-elements for rails, separators, ports, and labels.

The fully absolute-positioned prototype idea is still too rigid for production because args, ports, rows, nesting, dnd, and row resizing are data-driven. The current flat prototype is closer to the right production direction: normal flow layout for dynamic rows, absolute/pseudo positioning only for cheap chrome.

## Recommended Next Steps

1. Keep the production rewrite data-driven: row lists should remain mapped React data, not absolute-positioned individual text nodes.
2. Replace hot row Tailwind utility chains with component CSS or a CSS module under a section namespace.
3. Keep args/entries controls unmounted by default.
4. Split param rows into a cheap non-dnd row path and mount `useSortable` only when param selection/reorder mode is active.
5. Use a parent CSS variable for column width and flex/fixed-basis row cells so row resizing does not require grid/subgrid for the common case.
6. Keep `TextInputCodeMirror`, but treat it as an edit-mode mount where possible; the non-editing display path should be closer to static text.
7. Reduce observers and layout reads by deriving known row heights from data where possible, then reserve measurement for genuinely variable-height content.
8. Profile a real project with 100, 500, and 1,000 visible callable/dict sections before deciding whether `will-change` during viewport interaction is a net win.

## Conclusion

The prototype should not be copied wholesale into production, but its direction is correct. The production target should be a hybrid:

- flex/flow layout for rows and dynamic content,
- CSS variables for row height, column width, indent, and theme,
- pseudo-elements for visual hierarchy,
- unmounted controls by default,
- dnd/resize/editing machinery mounted only when the user can interact with it.

That keeps the future migration practical while addressing the actual pan/zoom risks: DOM size, style recalculation, layout measurement, and paint-state complexity.

## Raw Artifacts

- `perf/artifacts/flat-section-prototype-analysis-2026-04-25.png` (ignored by git)

## Automated Perf Tests

- Existing related tests:
  - `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx`
  - `frontend/src/components/Section/Layouts/DictArea.test.tsx`
  - `frontend/src/components/Params/GroupContainer.test.tsx`
- No new automated perf budget was added in this analysis pass.

## Update: CodeMirror Mounting Clarification

Date: 2026-04-25

The row-shape and pan/zoom notes above should be read with this important production detail: `TextInputCodeMirror` renders `DummyCodeMirror` by default, and the real `@uiw/react-codemirror` editor mounts only after the field is activated. That materially reduces the steady-state pan/zoom risk versus having live CodeMirror instances mounted for every key/value/callable field.

This changes the weighting, not the direction:

- Steady-state visible rows pay for dummy highlighted DOM, not full editor DOM.
- The expensive CodeMirror editor path is localized to the active field or fields.
- Multi-line inputs are still compatible with a flatter/flex row model, but rows need `min-height` plus natural height growth rather than a fixed prototype row height.
- The optimization target should be keeping the dummy display path cheap and avoiding continuous row measurement; not removing CodeMirror from editing.

The report's recommendation to treat real CodeMirror as an edit-mode mount still stands and matches the current implementation.
