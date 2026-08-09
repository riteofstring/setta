# Phase 0 executable reference set

This directory is the executable-product reference required by Phase 0 item 2. It records the
running Setta workspace before package implementation; it is evidence, not a redesigned target.

## Provenance and isolation

- Product authority: `../setta-main`, branch `main`, commit
  `043d3b2e9c69caf99d1246f1408b3ad7194b7864`.
- Capture date: 2026-08-10 in `America/Los_Angeles`.
- App URL: `http://127.0.0.1:3063/being_cliff`; the frontend returned HTTP 200 while capturing.
- Capture client: the repository's Chrome DevTools MCP browser on CDP port 9309. Screenshots were
  taken from the live DOM at device-pixel ratio 2; computed styles, accessibility state, console
  output, pointer input, and Performance traces came from the same Chrome session.
- The requested desktop browser window was 1440 x 900. Chrome's page viewport was 1440 x 772 after
  browser chrome, producing 2880 x 1544 PNGs at device-pixel ratio 2. The narrow capture used an
  800 x 772 page viewport.
- The frozen checkout stayed untouched. The app used a disposable runtime root and a disposable
  copy of the project store. Fixture creation and state changes used the running product's UI,
  HTTP surface, and owner-defined stores/functions inside that disposable copy.
- `git status --porcelain=v1` in `../setta-main` was empty before and after capture.

The fixture evolves across the numbered captures. A screenshot specifies the state named in its
filename; later drag scenarios intentionally change ordering, depth, or position. The fixture names
(`sleeping_thinking`, `diving_royal`, and similar) are disposable generated names and are not part of
the package contract.

## Screenshot manifest

| File                                                                                                                 | State characterized                                                         |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`01-full-workspace-dark-1440x900.png`](screenshots/01-full-workspace-dark-1440x900.png)                             | Representative desktop workspace, dark appearance                           |
| [`02-full-workspace-light-1440x900.png`](screenshots/02-full-workspace-light-1440x900.png)                           | Same representative desktop workspace, light appearance                     |
| [`03-root-leaf-idle-dark.png`](screenshots/03-root-leaf-idle-dark.png)                                               | Smallest root leaf, idle chrome at original scale                           |
| [`04-root-leaf-selected-dark.png`](screenshots/04-root-leaf-selected-dark.png)                                       | Selected root leaf; outline overlays without changing geometry              |
| [`05-root-leaf-locked-dark.png`](screenshots/05-root-leaf-locked-dark.png)                                           | Locked position/size state                                                  |
| [`06-root-leaf-minimized-dark.png`](screenshots/06-root-leaf-minimized-dark.png)                                     | Minimized root leaf                                                         |
| [`07-root-leaf-resized-dark.png`](screenshots/07-root-leaf-resized-dark.png)                                         | Bottom-right resize result                                                  |
| [`08-root-leaf-moved-dark.png`](screenshots/08-root-leaf-moved-dark.png)                                             | Root movement from its ordinary noninteractive surface                      |
| [`09-root-group-vertical-children-dark.png`](screenshots/09-root-group-vertical-children-dark.png)                   | Root group with vertical ordered children                                   |
| [`10-three-level-nesting-horizontal-group-dark.png`](screenshots/10-three-level-nesting-horizontal-group-dark.png)   | Three-plus visible levels: root group, nested groups, and horizontal leaves |
| [`11-freeform-nested-group-dark.png`](screenshots/11-freeform-nested-group-dark.png)                                 | Freeform outer workspace group containing nested ordered structure          |
| [`12-sorted-within-horizontal-parent-dark.png`](screenshots/12-sorted-within-horizontal-parent-dark.png)             | Completed reorder within a horizontal parent                                |
| [`13-sort-drag-active-dark.png`](screenshots/13-sort-drag-active-dark.png)                                           | Sustained pointer sort with source placeholder and drag overlay             |
| [`14-invalid-drop-feedback-dark.png`](screenshots/14-invalid-drop-feedback-dark.png)                                 | Production `INVALID` drop presentation during a held pointer gesture        |
| [`15-toolbar-hover-tooltip-dark.png`](screenshots/15-toolbar-hover-tooltip-dark.png)                                 | Toolbar hover and mouse-following tooltip treatment                         |
| [`16-toolbar-focus-pressed-dark.png`](screenshots/16-toolbar-focus-pressed-dark.png)                                 | Keyboard focus ring plus pressed snap/minimap controls                      |
| [`17-minimap-viewport-mask-dark.png`](screenshots/17-minimap-viewport-mask-dark.png)                                 | Minimap node paint and viewport mask at original pixels                     |
| [`18-cross-depth-free-move-dark.png`](screenshots/18-cross-depth-free-move-dark.png)                                 | Leaf moved from nested parent to top-level freeform layout                  |
| [`19-move-from-body-whitespace-dark.png`](screenshots/19-move-from-body-whitespace-dark.png)                         | Move initiated from section body whitespace                                 |
| [`20-nested-param-drag-active-dark.png`](screenshots/20-nested-param-drag-active-dark.png)                           | Nested parameter/item sort while pointer remains active                     |
| [`21-nested-param-drag-dropped-dark.png`](screenshots/21-nested-param-drag-dropped-dark.png)                         | Parameter/item order after drop                                             |
| [`22-narrow-workspace-dark-800x900.png`](screenshots/22-narrow-workspace-dark-800x900.png)                           | 800-pixel browser width / 800 x 772 page viewport                           |
| [`23-browser-page-scale-200-dark.png`](screenshots/23-browser-page-scale-200-dark.png)                               | Chrome page-scale factor 2; visual viewport 720 x 386                       |
| [`24-workspace-zoom-200-dark.png`](screenshots/24-workspace-zoom-200-dark.png)                                       | XYFlow workspace transform at exact zoom 2, distinct from browser zoom      |
| [`25-root-callable-selected-with-params-dark.png`](screenshots/25-root-callable-selected-with-params-dark.png)       | Selected resized callable and four item rows, dark appearance               |
| [`26-final-fixture-light-1440x900.png`](screenshots/26-final-fixture-light-1440x900.png)                             | Evolved full fixture with toolbar/minimap, light appearance                 |
| [`27-root-callable-selected-with-params-light.png`](screenshots/27-root-callable-selected-with-params-light.png)     | Selected callable and item rows, light appearance at original pixels        |
| [`28-three-level-nesting-horizontal-group-light.png`](screenshots/28-three-level-nesting-horizontal-group-light.png) | Nested group chrome and horizontal leaves, light appearance                 |

## Interaction captures

The gzip files in [`interaction-captures/`](interaction-captures/) are Chrome Performance trace
JSON and can be imported into the DevTools Performance panel. They preserve the real pointer event,
render, layout, and paint sequence rather than substituting a scripted animation. Their scenario
map and interpretation notes are in
[`interaction-captures/README.md`](interaction-captures/README.md). Exact before/after state,
interactive-exclusion attempts, and trace measurements are recorded in
[`computed/interaction-observations.json`](computed/interaction-observations.json).

The high-level Chrome drag helper cannot sustain several React/dnd-kit states because React detaches
the source DOM node after activation. Those cases used raw `Input.dispatchMouseEvent` calls through
the same Chrome DevTools Protocol connection. They are browser pointer input, not store-only gesture
simulation. The invalid-drop capture combines a held real pointer gesture with the `INVALID` value
returned by main's `getBehaviorDropType(active, target)` and published to main's drag store; this
makes the otherwise timing-sensitive feedback stable long enough to record.

## Computed geometry and styles

[`computed/reference-style-metrics.json`](computed/reference-style-metrics.json) records authored
CSS dimensions and live bounding boxes, padding, gaps, fonts, light/dark colors, borders, outlines,
radii, shadows, icon sizes, minimap paint, and z-index relationships. Important invariants include:

- idle and selected 202 x 124 root-leaf geometry is identical; selection changes the outer outline
  from transparent at z-index 10 to a 4-pixel blue outline at z-index 150;
- the minimized leaf is 202 x 34 and the resized leaf is authored as 302 x 212;
- the toolbar uses 23 x 23 clickable controls around 15 x 15 icons, a 4-pixel group gap, and a
  keyboard-only 2-pixel focus ring;
- the minimap panel is 202 x 152 around a 200 x 150 SVG, with separately recorded light/dark mask
  paint; and
- parameter rows are authored as 276 x 20 with a 4-pixel vertical rhythm inside the resized leaf.

## Gesture ownership conclusions

- Header, body whitespace, and ordinary noninteractive section surface all own section movement.
- Pointer starts on a text input, compact header button, or CodeMirror editor leave section geometry
  unchanged. These are interaction-boundary requirements, not incidental class names.
- The bottom-right resize affordance changes size without translating the section and does not
  activate section movement.
- Sorting keeps a source placeholder and drag overlay, cross-depth movement changes parentage only
  on drop, and nested item sorting owns the pointer instead of the surrounding section.

## Capture-only console observations

The frozen development app emitted its existing React Router future-flag warning, React 19
`element.ref` warnings, and form-field audit issues. Aborted fixture-transition experiments also
emitted `Expected positionsById`, missing temporary section implementation, and `NaN` z-index
messages. None is an accepted interaction or an error the package should reproduce. The numbered
screenshots were visually inspected after the fixture stabilized.

## Phase 0 review boundary

This set is presented together with
[`../extraction-seam-proposal.md`](../extraction-seam-proposal.md). Approval authorizes only the
exact Phase 1 slice: one root leaf, one root group with a nested leaf, accepted chrome and
selection geometry, full-surface movement with interactive exclusions, reference resize treatment,
the minimal zoom/fit toolbar, and a backend-free playground route. Recursive groups, parameter
dragging, broad APIs, and later hardening remain outside Phase 1 even though they are captured now as
future reference behavior.

**Decision:** the developer explicitly approved this reference set and exact Phase 1 slice on
2026-08-10. Phase 1 may proceed; the approval does not extend to later gates.
