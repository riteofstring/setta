# Home Page Project Browser Plan (Reuse Browser Section Components)

## Goals
- Replace the current Setta home page “project cards” UI with the Browser section’s view system (list / icon / carousel).
- Preserve the existing **SVG minimap project thumbnails** (currently rendered via `MinimapSvg`) and show them in:
  - Icon view (grid thumbnails)
  - Carousel view (thumbnail strip + main preview)
- Keep existing home page actions and behaviors:
  - New Config, Make Default, Delete
  - Multi-select (disabled in share mode)
  - Filter via the existing header search (`HomePageSearchBar`)
- Maintain performance for large project lists (minimal DOM, avoid expensive re-renders).

## Non-goals
- Changing how project metadata is loaded (`loadAllProjectMetadata`) or backend project storage.
- Changing the thumbnail “look” (node color, mask, sizing) unless required for parity.
- Introducing backwards compatibility (we can delete old home page thumbnail code once replaced).

## Current Implementation (Feb 2026)
- Home page projects grid + SVG thumbnail:
  - `frontend/src/components/Pages/Home/HomePage.tsx`
  - “Thumbnail” is `PreviewImg` which builds nodes from `ProjectConfig.topLevelSections` and renders `MinimapSvg`.
- Browser section view system (list / icon / carousel):
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - Uses `BrowserAreaViewModeEnum` with `list | thumbnail | carousel`
  - Icon view is implemented by `ThumbnailItem` + `BrowserThumbnailContent`
  - Carousel view is implemented via `components/Utils/MediaCarousel`

## Proposed Approach
### 1) Extract the SVG project thumbnail into a reusable component
Create a dedicated component that renders the current minimap SVG, so it can be reused by Home + other views consistently.

- New component (suggested):
  - `frontend/src/components/Thumbnails/ProjectMinimapThumbnail.tsx`
- Inputs:
  - `topLevelSections: ProjectConfig["topLevelSections"]`
  - Optional `width/height` (default to current 200x150) and `className`
- Requirements:
  - Render exactly the same SVG output as `PreviewImg` in `HomePage.tsx` today (same node color/mask/border radius).
  - Be cheap to render:
    - Use `useMemo` for node list + bounds math
    - Consider `React.memo` if the props are stable

This preserves the “SVG thumbnail views we still have” while allowing the home page to switch to Browser-style layout.

### 2) Extract reusable “Browser view” UI primitives from `BrowserArea.tsx`
The Browser section already has the UI patterns we want (view selector + icon grid + carousel). Today they’re embedded in `BrowserArea.tsx` and coupled to `FolderContentItem`.

Refactor into generic, reusable components that accept:
- a `viewMode` (`list | thumbnail | carousel`)
- a set of items
- render functions for list rows, thumbnail tiles, and carousel thumbnails/previews

Suggested module split:
- `frontend/src/components/BrowserViews/BrowserViewSelector.tsx`
  - Extract `ViewSelector`/`ViewSelectorButton` (keep the same aria labels: “List view”, “Icon view”, “Carousel view”)
- `frontend/src/components/BrowserViews/BrowserThumbnailGrid.tsx`
  - Extract the icon grid container + tile shell (currently `ThumbnailItem`)
- `frontend/src/components/BrowserViews/BrowserCarousel.tsx`
  - Wrap `MediaCarousel` with consistent sizing/styling hooks and overlay support
- Keep the Browser section-specific file preview logic inside `BrowserArea.tsx`
  - `BrowserThumbnailContent`, file-type badges, file-url plumbing remain file-browser only

This lets:
- `BrowserArea.tsx` continue to work (using the extracted primitives)
- Home page reuse the same view system without pulling in file-browser state

### 3) Implement a Home “Project Browser” using the extracted primitives
Replace `ProjectItems/ProjectItem/ThumbnailWrapper/ThumbnailArea` in `HomePage.tsx` with a single browser-style component.

Suggested new component:
- `frontend/src/components/Pages/Home/ProjectBrowser.tsx`

Inputs:
- `projects: Array<ProjectConfig>`
- `defaultProjectConfigId: string | null`
- `selectedProjects: Array<string>`
- `setSelectedProjects` or `onToggleSelected(projectId)`
- `selectionEnabled: boolean` (false in share mode)
- `isShareMode: boolean`

Data + filtering:
- Keep filtering in `HomePage.tsx` (same `matchSorter` over `useHomePageSearch` value) so header search behavior stays identical.
- Pass `filteredProjects` into `ProjectBrowser`.

View modes:
- Add a small home-page view-mode store:
  - `useHomePageProjectBrowserViewMode` in `frontend/src/state/definitions.ts`
  - Use `BrowserAreaViewModeEnum` values for consistency (`list`, `thumbnail`, `carousel`)
  - Persist to localStorage (optional but recommended for UX parity with Browser section)

Rendering requirements (parity with current behavior):
- Icon view (thumbnail grid):
  - Each project tile uses `ProjectMinimapThumbnail` (SVG) as the thumbnail content.
  - Keep the existing `project.previewImgColor` background behavior from `HomePage.tsx`.
  - Checkbox selection overlay:
    - Show only when `selectionEnabled`
    - Clicking checkbox toggles selection and does not navigate
- Carousel view:
  - Use `MediaCarousel` (via the extracted wrapper).
  - Thumbnails in the strip are **SVG** (`ProjectMinimapThumbnail`), not icons.
  - Main preview area can be either:
    - A larger `ProjectMinimapThumbnail`, or
    - The same SVG scaled up (preferred for parity and simplicity)
  - Double-click behavior should open the project (match Browser carousel’s “open on double click” ergonomics).
- List view:
  - Keep it simple and performant: a single-column list with:
    - small SVG thumbnail (optional)
    - project name
    - default indicator (home icon)
    - selection checkbox (when enabled)

Navigation + selection semantics:
- Preserve current semantics from `ThumbnailWrapper`:
  - When not in selection mode, clicking a project navigates (uses `Link`).
  - When selection mode is active (any selected) clicking toggles selection (no navigation).
  - In share mode: selection disabled, clicks navigate to share paths.
- Preserve keyboard access:
  - Prefer `Link`/`button` semantics instead of `div` handlers where possible.
  - Ensure Enter/Space works to open in non-selection mode.

## Implementation Phases
### Phase A: Extraction (no home page behavior change yet)
1. Add `ProjectMinimapThumbnail.tsx` and swap `HomePage.tsx` to use it (still the existing grid).
2. Extract Browser primitives out of `BrowserArea.tsx` into `components/BrowserViews/*`.
3. Update `BrowserArea.tsx` to use the extracted primitives (no behavior change).

### Phase B: Home page switch to ProjectBrowser
1. Add `ProjectBrowser.tsx` implementing list/icon/carousel.
2. Add `useHomePageProjectBrowserViewMode` store + optional persistence.
3. Update `frontend/src/components/Pages/Home/HomePage.tsx` to render `ProjectBrowser` instead of the current grid card implementation.
4. Delete now-dead components inside `HomePage.tsx` (old `ProjectItem`, `PreviewImg`, etc.), keeping only high-level orchestration.

### Phase C: Polish + parity checks
- Verify SVG thumbnails match the old appearance in icon view.
- Ensure carousel thumbnail strip uses SVG thumbnails (no regressions to icon placeholders).
- Ensure selection mode + share mode behaviors still match current home behavior.
- Confirm layout works for small screens (thumbnail grid wrapping, carousel sizing).

## Testing Plan
### Vitest (component-level)
- Add `frontend/src/components/Thumbnails/ProjectMinimapThumbnail.test.tsx`
  - Validate it renders an `<svg>` and is stable for a small `topLevelSections` fixture.
  - Keep assertions structural (avoid brittle exact SVG string matches).
- Add `frontend/src/components/Pages/Home/ProjectBrowser.test.tsx`
  - Given 2-3 `ProjectConfig` fixtures, verify:
    - Icon view renders per-project SVG thumbnails.
    - Carousel view renders a carousel and the thumbnail strip includes SVGs.
    - SelectionEnabled=false hides selection controls.

### Playwright (E2E)
- Add `frontend/tests/e2e/home/home-project-browser-views.spec.ts`
  - Create at least 2 configs via the UI (“New Config” twice).
  - Switch to “Icon view” and assert:
    - At least one project tile contains an `svg` thumbnail element.
  - Switch to “Carousel view” and assert:
    - Thumbnail strip exists and uses SVG thumbnails.
    - Double-clicking a carousel item opens the project (navigates off home).
  - Share mode coverage can be a follow-up if not already exercised elsewhere.

## Verification Checklist (when implementing)
- CDP visual check: confirm icon + carousel thumbnails are SVG minimaps and match the old home cards.
- Performance: with a large number of projects, confirm view switching does not cause large layout thrash or excessive re-rendering.

## Risks / Notes
- The Browser section primitives are currently intertwined with file-browser concerns; extraction should avoid dragging `FolderContentItem`-specific logic into shared components.
- Ensure we don’t accidentally depend on `setta_files` for tests (E2E should create configs via UI, not by relying on existing local state).

## Open Questions
- Default home page view mode: should it start in `thumbnail` (current behavior) or `list` (Browser default)?
- Should the view mode persist across reloads (localStorage), or reset each session?
- Should list view include thumbnails, or be text-only for maximum performance?
