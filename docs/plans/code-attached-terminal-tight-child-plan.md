# Code-Attached Terminal Tight Child Plan

## Goal
Make code-attached terminals render and resize like other child sections, while staying true children of the code section, with independent sizing and a tight visual attachment (no margin/pill, no title bar).

## Approach
- Remove the embedded split layout in `CodeArea` so terminals are not rendered inside the code section.
- Render code section children via the standard nested section pipeline, but with a "tight" layout variant (no margin bar, no gaps).
- Hide the header for terminal sections that are attached children of a code section.
- Remove any frontend/backend size coupling that forces code section height to account for embedded terminals.

## Steps
1. **Frontend: stop embedded split rendering**
   - Remove `useEmbeddedTerminalSplit`, `EmbeddedTerminalStack`, and related embedded-terminal layout logic from `frontend/src/components/Section/Layouts/CodeArea.tsx`.
   - Keep the attached-terminal bookkeeping, but return only the code editor UI.

2. **Frontend: render code children using nested pipeline (tight layout)**
   - Add a tight layout variant to `frontend/src/components/Section/Container/ManyNestedSections.tsx` that removes the margin bar and gaps.
   - In `frontend/src/components/Section/Container/SectionContainer.tsx`, render nested sections for code sections using the tight variant.

3. **Frontend: hide terminal header when attached to code**
   - Detect terminal sections whose parent is a code section and whose ID matches `attachedTerminalSectionId`.
   - Pass a flag into `SectionContainerCoreResizabe` to suppress `SectionHeader` for those terminals.

4. **Remove size coupling**
   - Remove the embedded-terminal min-height inflation in `frontend/src/state/hooks/sectionSizes.ts`.
   - Make `ensure_code_section_embedded_terminal_size` a no-op in `backend/setta/types/helpers_lvl2.py` (or remove its resizing logic).

5. **Verification**
   - Manually confirm terminal child resizes independently and reflows text.
   - Confirm no split handle or embedded terminal layout remains.

