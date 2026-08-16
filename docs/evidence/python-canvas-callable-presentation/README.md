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
headless Chrome at 1440x900 CSS px with device scale 1. It commits `math.sqrt` and the parameter
value `3` through the ordinary product walkthrough first, so every capture shows the state the
section spends its life in, then reloads into each appearance before recording:

| Surface          | States        | Appearances |
| ---------------- | ------------- | ----------- |
| Square Root card | idle, focused | light, dark |
| Generated Python | idle, clicked | light, dark |

Each image is a component crop with eight CSS px of surrounding surface, not a full-app screenshot,
and each carries its own clip rectangle, SHA-256, computed geometry, and computed typography or
paint in the metrics file beside the donor values it was asserted against.

## What the images have to show

The Square Root crops are the whole card, because the composition is the point: the callable field
begins at the section header's own boundary, the Args toolbar begins at the field's with a measured
zero-pixel step, the first parameter row follows the toolbar by the item list's own eight pixels,
and the field is inset from both card edges by nothing but its own 2px margin. Compare that
continuous header → field → Args → parameters stack against main's
`docs/evidence/phase0/reference/screenshots/27-root-callable-selected-with-params-light.png` and its
dark counterpart.

The field itself is main's 16px-radius pill, and activation changes its border colour and nothing
else: its box may drift by at most one CSS px and its computed font family, size, weight, line
height, and colour are identical across the swap.

Generated Python paints only the declared generated region. In this committed eight-line document
the block runs from the end of the authored prefix to the start of the authored suffix, so the four
generated body lines carry the blue region and its three-pixel leading rail while the two blank
separators supply the donor's partial rounded boundary, and `import math` on line 1 and
`state = SettaState()` on line 8 stay on the ordinary Code-section surface. The compact uppercase
**GENERATED READ-ONLY** badge is centred on the block's upper boundary. The fixed 390px section
leaves the rest of its height unpainted — in the light idle capture the block ends 258 CSS px above
the section's own bottom. A real pointer click changes none of that paint and leaves the text
non-editable, unfocused, caret-free, and free of an inner outline; the section's own selection
chrome around the clicked captures is ordinary workspace behaviour, not part of this surface.
