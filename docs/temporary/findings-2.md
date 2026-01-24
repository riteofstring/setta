# Findings (Succinct Examples + Fixes + UX/DX)

## 1) Repo hygiene: local/editor/test artifacts committed

**Concrete example**
- `.vscode/settings.json` adds personal UI colors; `frontend/test-results/...` Playwright artifacts are committed; `docs/temporary/findings.md` is a transient note.

**Proposed fix**
- Remove these files from the branch and add ignores so they don’t reappear:
  - Add to `.gitignore`: `.vscode/`, `frontend/test-results/`, `docs/temporary/`
  - If you still want docs/temporary tracked, then move findings into `docs/notes/` and remove the temporary folder from git.

**Tests to run**
- None needed for this change.

**UX/DX before**
- DX: contributors get noisy diffs from local VSCode settings and Playwright output.

**UX/DX after**
- DX: cleaner diffs, fewer accidental commits.

---

## 2) Markdown heading-as-section-name now only H1

**Concrete example**
- A Markdown text block that starts with `## Tasks` will no longer set the section title to “Tasks.” (`backend/setta/types/helpers_lvl2.py:1619-1655` and `frontend/src/components/Section/Header/SectionHeader.tsx:122-197`)

**Proposed fix**
- If the intent is “first heading of any level,” keep old behavior:
  - Backend: restore `get_first_heading_or_text` usage for Markdown (or expand `get_first_markdown_h1` to accept `#{1,6}`).
  - Frontend: update `hasMarkdownH1` to match (e.g., `hasMarkdownHeading` with `#{1,6}`).
- If the intent is “H1 only,” add explicit UX copy/tooltips or settings to explain the rule and add a migration note.

**Tests to run**
- Backend: add a unit test covering markdown `##` and `###` cases.  
  Command: `source activate.sh && python -m unittest discover`
- Frontend: add a vitest for the heading detection helper.  
  Command: `cd frontend && pnpm test -- --run src/components/Section/Header/SectionHeader.test.tsx`

**UX/DX before**
- UX: any markdown heading updates section title.
- DX: users rely on `##` and `###` to drive titles.

**UX/DX after**
- UX: only H1 updates title (or restored to any heading if fix applied).
- DX: behavior is explicit and tested.

---

## 3) Pinned params max height is capped to content height

**Concrete example**
- If a user wants extra empty space in the pinned area for readability, resizing up now snaps back to content height (`frontend/src/components/Params/GroupContainer.tsx:715-732`).

**Proposed fix**
- Allow manual pinned height to exceed content height:
  - When `height` is a number (manual), use `maxHeight = availableHeight` instead of `Math.min(availableHeight, contentHeight)`.
  - Only cap to content height when height is `auto`.

**Tests to run**
- Playwright: extend `frontend/tests/e2e/pinned-params-resize.spec.ts` to resize pinned area above content and assert it stays.
  Command: `cd frontend && pnpm playwright test tests/e2e/pinned-params-resize.spec.ts`
- Vitest: add a unit test in `pinnedResize.test.tsx` for “manual height allowed above content max.”  
  Command: `cd frontend && pnpm test -- --run src/components/Params/pinnedResize.test.tsx`

**UX/DX before**
- UX: pinned area can’t stay larger than content; resizing feels “sticky.”

**UX/DX after**
- UX: user-controlled pinned height persists; resize feels consistent.

---

## 4) Auto-clamping section sizes can cause update jitter

**Concrete example**
- `CustomResizable` now dispatches size updates whenever minHeight/minWidth increases; if computed min sizes fluctuate due to DOM measurements, this can send repeated updates (`frontend/src/components/Utils/Resizable/CustomResizable.tsx:149-183`).

**Proposed fix**
- Throttle or gate auto-clamp updates:
  - Only dispatch if the computed size delta exceeds a small threshold (e.g., >2px).
  - Or debounce updates inside the effect to avoid rapid-fire network calls.
  - Or cache last-sent size per section to avoid repeats.

**Tests to run**
- Vitest: add a hook test for `useSectionMinMaxDims` or a component test that simulates minHeight changes and asserts only one update.
  Command: `cd frontend && pnpm test -- --run src/components/Utils/Resizable/CustomResizable.test.tsx`
- Playwright: add a scenario where resizing params changes minHeight and ensure only one network call (if you have request logging).
  Command: `cd frontend && pnpm playwright test tests/e2e/pinned-params-resize.spec.ts`

**UX/DX before**
- UX: occasional size “bounce” as min sizes stabilize.
- DX: extra network traffic, harder to trace size changes.

**UX/DX after**
- UX: smooth resizing with fewer auto-corrections.
- DX: fewer redundant updates, easier debugging.
