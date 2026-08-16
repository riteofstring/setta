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
| Callable field   | idle, focused | light, dark |
| Generated Python | idle, clicked | light, dark |

Each image is a component crop with eight CSS px of surrounding surface, not a full-app screenshot,
and each carries its own clip rectangle, SHA-256, computed geometry, and computed typography or
paint in the metrics file beside the donor values it was asserted against.

## What the images have to show

The Callable field is main's 16px-radius pill, and activation changes its border colour and nothing
else: its box may drift by at most one CSS px and its computed font family, size, weight, line
height, and colour are identical across the swap.

Generated Python is the donor's generated block: the blue region and its three-pixel leading rail
hug the eight rendered document lines, the ends are rounded, and the compact uppercase
**GENERATED READ-ONLY** badge is centred on the block's upper boundary. The fixed 390px section
leaves the rest of its height on the ordinary Code-section surface — in the light idle capture the
block ends 232 CSS px above the section's own bottom. A real pointer click changes none of that
paint and leaves the text non-editable, unfocused, caret-free, and free of an inner outline; the
section's own selection chrome around the clicked captures is ordinary workspace behaviour, not
part of this surface.
