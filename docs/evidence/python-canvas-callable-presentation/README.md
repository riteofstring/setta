# Python Canvas callable presentation captures

Working visual evidence for
[the callable section presentation plan](../../plans/python-canvas-callable-section-presentation-plan.md).
It is not an accepted regression lock: the supervisor inspects these images and the developer
accepts or rejects the live section. Only after that acceptance may this bundle become a baseline.

`computed/presentation-metrics.json` names the immutable source commit these images were rendered
from. A rerun against a different source replaces the whole set; it never amends itself into the
commit whose hash it records.

## What was recorded

`pnpm --filter @setta/python-canvas run capture:presentation` drives the production
`@setta/workspace` and Python Canvas builds, the real Go service, its pinned Basedpyright, and
headless Chrome at 1440x900 CSS px with device scale 1. It records the state the application boots
into: the Go service commits the shipped `math.sqrt` example before it accepts a request, so the
harness waits for that canonical first render instead of performing its own setup. It reloads into
each appearance, records the shipped 1x composition, and only then pinch-zooms the canvas with the
product's own gesture:

| Surface                     | States                            | Appearances |
| --------------------------- | --------------------------------- | ----------- |
| Square Root card            | idle, focused                     | light, dark |
| Generated Python            | idle, clicked                     | light, dark |
| Square Root card at 2x zoom | idle, focused, completion showing | light, dark |

Each image is a component crop with eight CSS px of surrounding surface, not a full-app screenshot,
and each carries its own clip rectangle, SHA-256, computed geometry, and computed typography or
paint in the metrics file beside the donor values it was asserted against. Every crop holds its whole
subject: the harness never clamps a crop to the viewport, and it fails rather than record a partial
image of something that does not fit. An earlier bundle's enlarged cards were clamped that way, so
their headers were missing; the gesture is now anchored on the callable field, which keeps the
doubled card inside the canvas, and each appearance's enlarged sequence starts from a fresh page
load of the shipped `math.sqrt` scene.

## What the images have to show

The Square Root crops are the whole card, because the composition is the point: the callable field
begins at the section header's own boundary, the Args toolbar begins at the field's with a measured
zero-pixel step, the first parameter row follows the toolbar by the item list's own eight pixels,
and the field is inset from both card edges by nothing but its own 2px margin, within the harness's
stated one-pixel tolerance. Compare that continuous header → field → Args → parameters stack against
main's `docs/evidence/phase0/reference/screenshots/27-root-callable-selected-with-params-light.png`
and its dark counterpart.

The field itself is main's 16px-radius pill holding the committed `math.sqrt`, and activation
changes its border colour and nothing else: its box may drift by at most one CSS px and its computed
font family, size, weight, line height, and colour are identical across the swap.

The Args toolbar is the package's `authoring-and-filter` surface, so the card shows main's real
parameter authoring beside the `ARGS` label: remove last, add, delete selected, and the filter. The
filter advertises the workspace binding that focuses it, which is why the idle card reads `Filter`
and the focused card — where the callable field has made Square Root the sole active section —
reads `⌘ + K`. That text is the built-in `workspace.focus-item-filter` binding resolved for this
platform, not a string the application spells.

Generated Python paints only the declared generated region. In this seven-line document the block
runs from the end of the authored prefix to the start of the authored suffix — five marked lines,
so the three generated body lines carry the blue region and its three-pixel leading rail while the
two blank separators supply the donor's partial rounded boundary, and `import math` on line 1 and
`state = SettaState()` on line 7 stay on the ordinary Code-section surface. The compact uppercase
**GENERATED READ-ONLY** badge is centred on the block's upper boundary. The fixed 390px section
leaves the rest of its height unpainted — in the light idle capture the block ends 276.9 CSS px
above the section's own bottom.

The document around that block is authored Python, so it is an ordinary editing surface: a real
pointer click focuses it and leaves a caret and active line where authoring is allowed. In the
clicked captures the click lands in the empty height below the code, so the caret rests at the end
of the authored suffix on line 7 and the block above it is untouched — its region, rail, badge, and
bytes are identical to the idle capture, no caret sits on any marked line, and the text draws no
inner outline. The section's own selection chrome around the clicked captures is ordinary workspace
behaviour, not part of this surface.

The zoomed crops are the two defects the developer rejected the previous candidate on, at the
enlarged zoom they were found at. The scene is exactly doubled and settled, with the pointer resting
on the card, and the card carries no compositor layer of its own — `will-change: auto`,
`transform: none`, `backface-visibility: visible`, `isolation: auto` — so its text, icons, and
borders are rasterized at the size they are displayed at rather than scaled from the layer a gesture
left behind. Judge them for crispness against the same scene in main.

Each enlarged image holds the card's whole composition. The doubled card measures 724 by 564 CSS px
in a 1400 by 630 CSS px canvas. Its header clears the application status strip by 65 CSS px; no
header, field, toolbar, or parameter content is clipped. One CSS pixel of its left border overhangs
the canvas, inside the harness's two-pixel tolerance for the selection stroke. The canvas minimap
overlays the card's empty lower-left area as ordinary workspace chrome.

Idle and focused images show the full committed `math.sqrt` and the whole Args row — label, the
three authoring controls, and the filter. Completion images record the workflow after entering
`math.sq`: the pill shows that draft, the `ARGS` label and complete `x` row remain visible, and the
popup geometrically covers the filter. The whole two-option popup is 500 CSS px wide, extends
roughly 60 CSS px past the field, is inside neither the field nor the section, and is what the page
hit-tests at both recorded points. The single horizontal line that previously crossed the focused
pill was the only visible remnant when the section clipped this popup.
