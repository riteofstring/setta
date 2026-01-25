# setta.section-styles-edges + proposed tests (Vitest + Playwright)

## Worktree changes (rundown)
- Markdown text blocks default to using headings as section names (H1 only for Markdown), and the UI hides the inline title when the heading is active. The title stays visible until a valid heading exists. (`backend/setta/types/helpers_lvl2.py`, `frontend/src/components/Section/Header/SectionHeader.tsx`)
- Text blocks default to edit mode on creation and can be toggled between render/edit from a new header button. (`frontend/src/state/actions/sections/createSections.ts`, `frontend/src/components/Section/Header/ToggleTextBlockDisplayModeButton.tsx`)
- Pane context menu now groups section types, adds a filter input with keyboard capture, and repositions to stay within the viewport. (`frontend/src/components/Utils/ContextMenus/PaneContextMenu.tsx`, `frontend/src/components/Utils/ContextMenus/ContextMenuCore.tsx`, `frontend/src/state/actions/sections/createSectionsHelper.ts`)
- Params UI updates: pinned params persist via a new backend route, pinned area is resizable, and edge inputs/outputs now render in a dedicated strip and are removed from the param list. Section min sizing accounts for pinned/edge strips and resize clamps respect min dims. (`frontend/src/components/Params/GroupContainer.tsx`, `frontend/src/state/hooks/sectionSizes.ts`, `frontend/src/components/Utils/Resizable/CustomResizable.tsx`, `backend/setta/project_state/*`, `backend/setta/types/*`)
- Terminal sections now focus the terminal input on creation via new focus tracking logic. (`frontend/src/utils/tabbingLogic.ts`, `frontend/src/state/hooks/terminals/terminal.ts`)
- Kwargs controls got tooltips, tighter icon styling, and the Args label hides on narrow containers; link hover styling updated. (`frontend/src/components/Section/SectionParts/KwargsControls.tsx`)
- Dev tooling: worktree creation now requires explicit branch names, dev instance runner auto-derives ports from worktree name and installs deps if missing, and a Browser MCP starter script + docs were added. `VITE_BACKEND_ORIGIN` now configures backend/websocket origins for dev. (`scripts/*.sh`, `docs/*.md`, `frontend/src/utils/c_addresses.ts`)
- Generator excludes runtime context types, and VSCode workspace color customizations were added. (`frontend/generation/convert_pydantic_to_js.py`, `.vscode/settings.json`)

## Proposed tests
Tooling split: Vitest for logic/unit coverage, Playwright for UI flows.

### Test intent guardrails
- Assert user-visible behavior or state transitions, not just that a handler ran.
- Include at least one negative or regression check per feature (e.g., wrong heading should not change title).
- Use real code paths and production data shapes; avoid fakes/mocks that bypass logic.
- Prefer assertions that would fail on a regression (UI text, sizes, focus, persisted state).

### Backend (python unittest)
- Markdown heading defaults and naming
  - Create a Markdown TextBlock without overrides; assert `headingAsSectionName` defaults to true.
  - With no H1, assert section name stays at default until an H1 is added via `set_text_block_text`.
  - With only H2 or deeper headings, assert the name does not change for Markdown.
  - With explicit `headingAsSectionName=False` override, assert no auto-title changes.
  - Suggested location: `tests/types/test_text_block_heading_defaults.py`.
- Heading parsing helpers
  - Cover `get_first_heading_or_text` and `get_first_markdown_h1` on mixed inputs (leading whitespace, empty headings).
  - Suggested location: `tests/types/test_text_block_heading_parsing.py`.
- Pinned params route
  - Create a callable section with params, call `set_section_pinned_params`, assert `pinnedParams` updated in the section impl and persisted in project state.
  - Suggested location: `tests/project_state/test_set_section_pinned_params.py`.

### Frontend UI (Playwright)
- Context menu filtering + grouping
  - Open the pane context menu, verify the filter input auto-focuses, typing filters items, and the grouped labels render.
  - Create sections via filtered selection (Markdown, Plain text, Terminal).
- Text block display mode toggle
  - Create a text block, verify it opens in edit mode, then toggle to render mode and back; confirm UI changes and persistence.
- Markdown heading as section title
  - Create a Markdown text block; verify title is shown until an H1 is inserted, then title hides and header reflects the H1.
- Terminal focus on create
  - Create a terminal section and assert the xterm input is focused (active element is the terminal textarea/helper).
- Params/edges UX
  - Select params, pin them, and verify the pinned area appears and persists across refresh.
  - Convert selected params to edge inputs and verify they move into the edges strip and are removed from the param list.
  - Resize pinned area and confirm min/max constraints hold; try shrinking the section below the edges/pinned minimum and assert clamp behavior.
- Context menu positioning
  - Open the menu near viewport edges and verify it repositions within the screen bounds.

### Frontend logic (Vitest)
- `useSectionMinMaxDims` state-driven sizing
  - Mount a section with pinned params and edge inputs; verify computed min sizes include pinned area height + edges strip height.
- `focusOnSectionTextInput`
  - Mount a text block and a terminal; verify focus targeting behaves correctly and pending focus clears.
- `C_ADDRESSES` origin resolution
  - Validate `VITE_BACKEND_ORIGIN` (with and without trailing slash) drives `BACKEND_ORIGIN` and `WEBSOCKET` correctly.

### Tooling/scripts (shell smoke tests)
- `scripts/create-worktrees.sh`
  - Missing args -> usage; invalid name -> error; valid names -> worktree created and env files copied.
- `scripts/run-dev-instance.sh`
  - No args -> uses worktree folder name; verify ports and `VITE_BACKEND_ORIGIN` match expectations.
  - `--mode startr` path works; missing deps triggers `dev_install.sh`.
- `scripts/start-browser-mcp.sh`
  - `--help` output; `--foreground` without `--devtools` errors; `--devtools` starts with remote debugging port.

### Generation
- `pnpm generate` output sanity
  - Assert `RuntimeContextFromRequest` and `RuntimeContextFromWebsocket` are excluded from generated TS types.
