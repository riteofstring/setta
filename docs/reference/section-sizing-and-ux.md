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

## Attached terminal UX
- Code-family sections (Code / GenPythonCode / GenPythonMetadata) expose a
  terminal toggle button in the section header while editing.
- If no terminal is attached, the button creates one as an attached child.
- If an attached terminal exists, the button toggles terminal minimized state
  (hide/show) without detaching it.
- A visible embedded attached terminal renders as a joined code+terminal group:
  one shared outer outline, joined corners, and one pair of agentic handles.
- A minimized attached terminal remains attached in state, but is hidden from
  the nested child render list so the code section renders standalone again.
- Embedded attached terminals hide their own header and show a compact trash
  button in the terminal area for fast deletion.
- Detached terminals revert to the normal standalone terminal layout with a
  header.

## Auto sizing rules
- `SectionSize.width` and `SectionSize.height` can be numeric pixels or
  `"auto"` to defer to layout heuristics.
- Auto height is capped by `sectionSizingPolicy.globals.autoMaxHeight` and the
  per-type max height; the cap never goes below the section's min height.
- Sections that rely on internal scrolling (for example Code, TextBlock, and
  Browser) will scroll within the capped height instead of growing indefinitely.
- When a Terminal is attached under a code section, the backend promotes the
  parent Code/GenPython section height to at least
  `min(Code) + min(Terminal) + 80` via
  `internal/projectstate/child_section_creation.go:ensureEmbeddedCodeSectionPayloadSize`.
- Attached terminals are normalized to concrete dimensions (no `"auto"` height):
  creation and run-attach flows seed height from Terminal defaults and align
  width to the parent code section when available.
- Width stays synchronized for embedded attachments:
  - attaching via move/drag into a code section aligns terminal width to the
    code width.
  - resizing an embedded attached terminal width also updates the parent code
    width so both stay in lockstep.
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
| TaskBoard | 720 x 430 |
| Spreadsheet | 760 x 500 |
| Terminal | 250 x 150 |
| Chat | 400 x 200 |
| Code | width 500, height auto |

Defaults are seeded from the Go project-state creation path in
`internal/projectstate/top_level_section_creation.go` and mirrored into
frontend factories in `frontend/src/utils/generatedTypes.ts` through
`internal/frontendbindings/converter.go`.

## Policy bounds
- Sizing bounds come from `SectionSizingPolicy` in
  `internal/settingsstate/defaults.json` and `internal/settingsstate/queries.go`.
- New sections and `set_section_sizes` payloads are normalized against the
  policy min/max bounds (non-finite values are rejected).
- When auto layout needs a width/height but a section size is `"auto"`, it
  falls back to the policy min dimension instead of erroring.
- Minimized sections use `globals.minimizedHeight` and ignore normal max heights.
