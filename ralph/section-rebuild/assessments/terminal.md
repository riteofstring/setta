# Terminal Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `Terminal` as a real frontend section type and `FrontendTerminalSectionImpl` with only base section fields.
  - `internal/projectstate/project_graph.go`, `internal/projectstate/run_graph.go`, `internal/projectstate/top_level_section_creation.go`, `internal/projectstate/attached_terminal_writes.go`, and `internal/projectstate/child_section_creation.go` define terminal section creation, interactive and managed-console session modes, top-level temporary terminals, and attached Code/GenPython terminal sizing/parenting.
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` routes `SectionTypeEnum.Terminal` to `TerminalArea`.
  - `frontend/src/components/Section/Layouts/TerminalArea.tsx` renders a full-size read/write terminal mount, context-dependent window inset, attached-terminal section id data, and an attached-terminal trash affordance when the terminal is embedded under a code section and not in user view.
  - `frontend/src/state/hooks/terminals/terminal.ts` mounts xterm, opens/reuses one WebSocket session per project/share/session/section, writes backend output, forwards user input, tracks readiness, and sends throttled resize messages.
  - `frontend/src/components/Section/Header/HeaderIcon.tsx` identifies Terminal as a read/write terminal in the section icon affordance.
- Data shown:
  - Section title/type, terminal section id, top-level vs attached context, session mode, read/write capability, connection/readiness state, fitted cols/rows, scrollback, and representative terminal transcript lines.
  - The fixture uses a top-level managed-console terminal so the body stays focused on the real Terminal section surface rather than a Code section's attached-terminal summary.
- Controls/actions:
  - Standard section shell controls remain available through the flat prototype shell.
  - The Terminal-specific body affordance is the xterm-style read/write surface: prompt, command input line, cursor, scrollback, and resize/session status.
  - No run, entry-code, diagnostics, params, ports, row controls, workflow handles, or file-binding controls belong to a standalone Terminal body.
- Important states:
  - Ready/connected read-write terminal with backend transcript.
  - Managed-console session mode and top-level context are represented as status metadata.
  - Attached-terminal trash and window-inset states are real states, but they are not the primary rendered fixture for this one-section pass.
- Interactions that must stay recognizable:
  - Typing into the terminal prompt, receiving backend output, focusing the terminal surface, scrolling terminal output, fitting to available section dimensions, and keeping terminal chrome full-bleed inside the section body.

## Layout Invariants
- Conceptual regions and ordering:
  - Shared flat section titlebar first.
  - Terminal body is a single dominant console surface that fills the remaining section height.
  - A compact status row can sit inside the terminal surface because it maps to session/readiness/size metadata, but it must not become a toolbar-heavy editor layout.
  - Terminal transcript and prompt occupy the primary region below the status row.
- Relative placement of important controls:
  - Standard shell controls remain in the titlebar.
  - Terminal input/cursor belongs at the bottom of the terminal transcript.
  - Readiness/session/size status stays secondary and visually lighter than the terminal transcript.
- Grouping/containment relationships:
  - The terminal surface is one contained read/write area, not row groups or nested cards.
  - Top-level fixture has no attached-parent indicator or attached-trash overlay.
  - Attached-terminal parent/trash affordances are omitted from this primary state rather than invented as always-visible controls.
- Scroll or overflow expectations:
  - The terminal transcript should be vertically scrollable when output exceeds available body height.
  - The section itself should not overflow; terminal content is clipped or scrolls inside the console surface.

## Intentional Differences
- The flat prototype may replace xterm's exact DOM with semantic HTML that communicates the same read/write terminal surface, prompt, cursor, scrollback, readiness, and resize affordances.
- Production layout logic intentionally not reused: no `TerminalArea` DOM, xterm DOM, resize hook wiring, WebSocket hook, Tailwind class chains, joined code-terminal group layout, or production section container structure is copied.
- The prototype is not fictional and is not an old-design lift: every visible affordance maps to Terminal base data, backend terminal session behavior, `TerminalArea` context behavior, or xterm read/write interactions.
- Every visible prototype affordance maps to real section behavior or data: title/type, section id, top-level context, managed-console mode, read/write session, ready/connected state, fitted terminal geometry, transcript, prompt, cursor, and terminal scrollback.
- The required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component.
- Callable and Param Dict/Dict baselines will not be visibly changed.

## Component Plan
- New files or functions:
  - Extend `FlatSectionKind` and section icon mapping with `terminal`.
  - Add `FlatTerminalSectionPrototype`, `FlatTerminalBody`, and a small Terminal fixture in `FlatSectionPrototype.tsx`.
  - Add Terminal-specific CSS in `FlatSectionPrototype.css` without touching accepted Callable or Dict CSS.
  - Add Terminal dark/light gallery entries with the external `Terminal` label.
- Static fixture data:
  - `terminal-managed-console`, top-level context, managed-console session mode, ready connection, read-write input mode, `96x24` fitted geometry, a short representative transcript, and the active prompt command.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to include Terminal in the gallery counts/labels and to verify Terminal-specific markup, absence of unrelated row/port/workflow/code controls, and protected Callable/Dict isolation.
  - Add a CSS guard that Terminal keeps a compact console-oriented height with scrollable transcript containment.
  - Run focused Vitest for `FlatSectionPrototype.test.tsx`, formatting checks, and CDP visual verification of the Terminal prototype when feasible.
