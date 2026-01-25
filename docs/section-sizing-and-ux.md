# Section Sizing and UX

This document summarizes default section sizes, sizing rules, and the user
experience around resizing.

## Resize UX
- Sections expose resize handles on the right edge, bottom edge, and
  bottom-right corner (unless resizing is locked or the size mode disallows it).
- Dragging a handle updates the section size; if a section has an aspect ratio
  lock, both dimensions update together.
- Double-click a resize handle (without dragging) to set that dimension to
  `"auto"` when the section allows auto sizing.
- If snap-to-grid is enabled in settings, resizing snaps to the configured grid.

## Auto sizing rules
- `SectionSize.width` and `SectionSize.height` can be numeric pixels or
  `"auto"` to defer to layout heuristics.
- Auto height is capped by `sectionSizingPolicy.globals.autoMaxHeight` and the
  per-type max height; the cap never goes below the section's min height.
- Sections that rely on internal scrolling (for example Code, TextBlock, and
  Browser) will scroll within the capped height instead of growing indefinitely.
- Size modes restrict which dimensions are user-resizable:
  - Terminal and Chart sections are manual-only for both width and height.
  - Callables with hidden params, Twitter embeds, and some MetaControl param
    types use auto-only height.

## Default sizes (selected types)

| Section type | Default size |
| --- | --- |
| Chart | 300 x 300 |
| Draw | 402 x 100 |
| TextBlock | width 500, height auto |
| Terminal | 250 x 150 |
| Chat | 400 x 200 |
| Code | width 500, height auto |

Defaults are mirrored into generated user defaults in
`backend/setta/types/generated/user_defaults.py` and into frontend schemas in
`frontend/src/utils/generatedTypes.ts`.

## Policy bounds
- Sizing bounds come from `SectionSizingPolicy` in
  `backend/setta/types/settings_state.py`.
- Minimized sections use `globals.minimizedHeight` and ignore normal max heights.
