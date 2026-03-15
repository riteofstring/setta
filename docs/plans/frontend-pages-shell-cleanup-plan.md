# Frontend Pages And Shell Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make page-level code easy to follow by giving routing, page loading, page shells, and standalone-surface behavior clear ownership boundaries.

## Scope

- In scope:
  - `frontend/src/components/Pages/**`
  - page routing and server-mode wrappers
  - home, launcher, share, and standalone project/window-space surfaces
- Out of scope:
  - detailed pane internals
  - chat-specific rendering internals
  - project chat windowing implementation details already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-16)

- `router.tsx` is no longer the only routing boundary. `routeConfig.ts` and `modeRouteResolver.ts` already exist and should be treated as the first stable seams for continued cleanup.
- `HomePage.tsx` is no longer the main page-shell hotspot. It now owns
  metadata bootstrap, selection/favorites state, and layout decisions while
  nearby local owners handle gallery rendering, side panes, selected-project
  details, and shared path/count helpers.
- `StandaloneWindowSpaceSurface.tsx` is no longer the main standalone
  page-shell hotspot. It now owns viewport observation and final standalone
  render composition while `standaloneWindowSpaceWindowModel.ts` owns local
  hydration, merge, focus, bounds, chat-id, and embedded-git visibility
  transitions and `useStandaloneWindowSpaceWindowSession.ts` owns local window
  session, blocked-window filtering, visible-window sorting, and snap-resize
  interaction state.
- This domain is now secondary to the larger unresolved project-chat, git,
  pane, section-layout, runtime, and app-mode front doors. When page work is
  the right next slice, default to the standalone project/window-space
  surfaces rather than router-only churn or another immediate re-cut of the
  smaller home-page coordinators.

## Current State (Observed)

- `frontend/src/components/Pages` totals about 10.5k lines of authored code.
- The main unresolved page-shell hotspots are:
  - `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx` at 751 lines
  - `frontend/src/components/Pages/Project/StandaloneProjectSurfacePage.tsx` at 644 lines
  - `frontend/src/components/Pages/router.tsx` at 489 lines
- `frontend/src/components/Pages/Home/homeProjectGallery.tsx` is still a large
  local render owner at 719 lines, but it is no longer the default page-domain
  first hop after the `HomePage.tsx` split.
- `frontend/src/components/Pages/Home/HomePage.tsx` is now 451 lines after
  delegating project gallery/list rendering to `homeProjectGallery.tsx`,
  workspace/browser plus side-pane shells to `homeWorkspaceSidePanes.tsx`,
  selected-project metadata rendering to `homeSelectedProjectDetails.tsx`, and
  shared path/count helpers to `homeProjectNavigation.ts`.
- `frontend/src/components/Pages/Project/StandaloneWindowSpaceSurface.tsx` is
  now 333 lines after delegating standalone window hydration/merge/focus/bounds
  transitions plus chat-id and embedded-git visibility writes to
  `standaloneWindowSpaceWindowModel.ts` and local window-session,
  blocked-window filtering, visible-window sorting, and snap-resize
  interaction ownership to `useStandaloneWindowSpaceWindowSession.ts`.
- `router.tsx` currently mixes:
  - server-mode initialization and retry UI
  - lazy imports
  - route element assembly
  - redirects
  - wrapper composition for IDE/share/app/launcher modes
- `homeProjectGallery.tsx` is now the main home-page render surface and still
  mixes:
  - gallery/list presentation
  - grid/list item navigation behavior
  - favorite/default toggles
  - empty-state chrome
- `HomePage.tsx` now mostly owns:
  - project metadata loading
  - project creation flow
  - search/favorites filtering state
  - compact-layout rules
  - local-storage driven pane state
- `StandaloneProjectSurfacePage.tsx` mixes:
  - route target resolution
  - document title logic
  - share-policy gating
  - page shell selection
  - standalone project chat / section / window-space rendering
- `StandaloneWindowSpaceSurface.tsx` now acts as a standalone-shell coordinator,
  while the local standalone window model/session owners make its window-state
  and snap-resize behavior easier to compare with authoring-mode window
  behavior.

## Cleanup Principles

1. Routes should declare composition, not own page logic.
2. Page components should own page flow, not low-level resize/snap math.
3. Route target resolution, loading state, and rendering should be separate modules.
4. Standalone surfaces should reuse shared window/surface helpers when the behavior is the same.
5. More page-domain files are acceptable when the entry surface stays obvious; avoid generic `helpers` buckets when a sharper page-domain name would make grep sufficient.

## Plan

1. Split the home-page front door before router-only cleanup

- Keep `HomePage.tsx` focused on:
  - metadata bootstrap/load path
  - selection and favorites model
  - layout mode calculation
- Keep home-page rendering ownership in the local page-domain files:
  - `homeProjectGallery.tsx`
  - `homeWorkspaceSidePanes.tsx`
  - `homeSelectedProjectDetails.tsx`
  - `homeProjectNavigation.ts`
- Revisit those local owners only when one of them becomes the real first-hop
  bottleneck. Do not add a home-page subfolder or directory `README.md` unless
  grep and naming stop being sufficient.

2. Split route assembly from route behavior

- Continue moving mode-specific wrapper composition out of `router.tsx` into small route modules, building on `routeConfig.ts` and `modeRouteResolver.ts`.
- Keep `router.tsx` as the assembly point for paths and top-level route trees.
- Extract retry/loading/error shells for server-mode initialization so they are not inline route clutter.

3. Refactor page loaders and guards

- Create explicit page-level loader/guard helpers for:
  - project loading
  - standalone chat/share-policy access
  - share home fallback behavior
  - launcher-specific availability checks
- Keep page renderers focused on UI state once loading/guard conditions are resolved.

4. Split standalone project surfaces

- Break `StandaloneProjectSurfacePage.tsx` into:
  - route target resolution
  - title derivation
  - share-policy gating
  - body renderers by target kind
- Keep standalone section/project chat/window-space shells explicit and separate.

5. Keep standalone window-space interaction logic isolated

- Keep local hydration, merge, focus, bounds, chat-id, and embedded-git
  visibility transitions in `standaloneWindowSpaceWindowModel.ts`.
- Keep local window-session, blocked-window filtering, visible-window sorting,
  and snap-resize interaction state in
  `useStandaloneWindowSpaceWindowSession.ts`.
- Keep `StandaloneWindowSpaceSurface.tsx` focused on viewport observation and
  standalone-only render composition.

6. Standardize page shell composition

- Make `AppShell`, header/modal wrappers, and page grid shells composable via small helpers instead of repeated inline JSX trees.
- Use consistent naming for shell vs content components so route ownership is obvious.

## Risks And Mitigations

- Risk: route regressions across IDE/share/app/launcher modes.
  - Mitigation: keep route paths unchanged and add focused router/page tests around mode selection and redirects.
- Risk: standalone surfaces drift from authoring behavior while being “cleaned up”.
  - Mitigation: extract shared math/helpers first, then refactor rendering around them.
- Risk: home-page splits create too many tiny files with unclear ownership.
  - Mitigation: group new modules by page domain, not by generic “helpers”.

## Verification

- Update or add Vitest coverage for:
  - route resolution and redirects
  - standalone target resolution and document title derivation
  - home-page selection/filtering/layout helpers
- Run relevant page Playwright coverage if page flows change.
- Use CDP visual checks for any page shell/layout changes.

## Acceptance Criteria

- `router.tsx` becomes mostly declarative route composition.
- Home, launcher, and standalone page flows have obvious entry points and loader/guard boundaries.
- Standalone window-space logic is easier to compare against shared windowing behavior.
- A contributor can find the right page file without tracing through wrapper-heavy route code.
