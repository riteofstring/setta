# Frontend State And Shared Infrastructure Cleanup Plan

Companion to [frontend-cleanup-plan.md](./frontend-cleanup-plan.md).

## Goal

Make shared frontend infrastructure legible by separating read models, mutation commands, optimistic sync helpers, and DOM interaction utilities.

## Scope

- In scope:
  - `frontend/src/state/**`
  - cross-cutting infrastructure under `frontend/src/components/Utils/**`
  - non-generated shared helpers in `frontend/src/utils/**`
- Out of scope:
  - generated endpoints/types
  - forked libraries under `frontend/src/forks/**`
  - chat-specific cleanup already covered in [frontend-cleanup-plan.md](./frontend-cleanup-plan.md)

## Status Refresh (2026-03-14)

- Unlike the later `clean-code` branch, this branch still has the original `frontend/src/state/definitions.ts` monolith. Store ownership cleanup remains a first-order task here.
- `frontend/src/state/actions/projectChatWindowing.ts` already delegates some logic to `projectChatWindowingAuthoritative.ts` and `projectChatWindowingEphemeral.ts`; future cleanup should build on those seams.
- `frontend/src/utils/constants.ts` is still unsplit on this branch, so shared-infrastructure cleanup is still high leverage.

## Current State (Observed)

- `frontend/src/state` plus shared infrastructure files in `components/Utils` and `utils` total about 83.6k lines of authored code in the sampled directories.
- The biggest shared-state hotspots are:
  - `frontend/src/state/definitions.ts` at 1500 lines
  - `frontend/src/state/actions/sectionInfos.ts` at 2030 lines
  - `frontend/src/state/actions/windowSpaces.ts` at 1422 lines
  - `frontend/src/state/actions/uiSettingReveal.ts` at 1597 lines
  - `frontend/src/state/actions/websocketReceive.ts` at 1029 lines
  - `frontend/src/state/hooks/terminals/terminal.ts` at 752 lines
- `definitions.ts` exports 45 `use*` stores, which obscures domain ownership and makes it hard to know which store a new feature should depend on.
- `sectionInfos.ts` currently mixes:
  - effective-impl derivation
  - optimistic project-state mutation helpers
  - streaming chat merge behavior
  - active-section coordination
  - project-chat windowing sync hooks
  - section metadata queries
- `windowSpaces.ts` mixes:
  - optimistic layout writes
  - floating bounds normalization
  - persisted window-space mutations
  - projection from authoring state to window-space state
- `focusManager.ts` at 656 lines mixes:
  - tab-scope registration
  - keyboard navigation policy
  - section focus behavior
  - canvas-specific pane movement
- `constants.ts` at 301 lines is a grab bag for:
  - routes
  - pane/tab enums
  - z-indexes
  - DOM class names
  - measurement key builders
- Shared UI infrastructure like `PaneContainer.tsx`, pane layout helpers, floating-box helpers, and focus management currently span multiple cross-cutting concerns, which makes edits feel riskier than they should.

## Cleanup Principles

1. Separate reads from writes.
   Selectors/query helpers should be distinct from mutation commands.

2. Separate domain state from cross-domain plumbing.
   Optimistic sync, websocket reconciliation, and DOM interaction helpers should not hide inside feature query files.

3. Make store ownership explicit.
   New code should depend on the smallest store surface possible.

4. Keep shared infrastructure small and layered.
   Routing constants, layout constants, measurement keys, and interaction-class names do not belong in one catch-all module.

## Plan

1. Split store definitions by domain

- Break `definitions.ts` into domain-owned store modules or thin domain re-export modules.
- Group stores by areas such as:
  - project state
  - UI chrome/layout
  - AI/chat state
  - temporary measurement state
  - share/session state
- Keep a minimal index only if it improves discovery without hiding ownership.

2. Split `sectionInfos.ts` into query and command layers

- Extract:
  - effective impl/read helpers
  - section metadata selectors
  - optimistic section mutation commands
  - reconciliation helpers for backend/project-state updates
- Keep naming explicit so agents can tell whether they are calling a read helper or a mutating command.

3. Normalize optimistic mutation infrastructure

- Create a consistent pattern for optimistic frontend mutations used by:
  - section mutations
  - window spaces
  - related layout/state features
- Reuse seams that already exist in `projectChatWindowingAuthoritative.ts` and `projectChatWindowingEphemeral.ts` where they fit instead of introducing parallel patterns.
- Avoid each domain hand-rolling slightly different optimistic update scaffolding.

4. Split cross-cutting interaction utilities

- Break `focusManager.ts` into smaller modules for:
  - tab-scope registry
  - keyboard navigation
  - section focus helpers
  - canvas-specific focus movement
- Split `constants.ts` into domain constants:
  - routes
  - panes/tabs
  - DOM interaction classes
  - measurement key builders
  - app chrome z-index/layout constants

5. Tighten shared component infrastructure

- Keep `PaneContainer`, pane layout helpers, floating-box helpers, and similar utilities small and composable.
- Make it obvious which layer owns:
  - viewport sizing
  - persisted pane state
  - DOM resize wrappers
  - focus behavior

6. Add domain READMEs and import guidance

- Document:
  - where new store state belongs
  - when to add a selector vs a command
  - when `utils/` is appropriate vs feature-local helpers
- Prefer explicit module imports over “just import from whichever mega-file already has something close”.

## Risks And Mitigations

- Risk: moving shared infrastructure causes widespread import churn.
  - Mitigation: split APIs first, then move files after callers depend on the new boundaries.
- Risk: over-normalizing state patterns makes simple features harder to implement.
  - Mitigation: keep abstractions minimal and only standardize what is already repeated.
- Risk: optimistic update helpers become too generic to understand.
  - Mitigation: retain domain-specific command entry points even if shared helpers exist underneath.

## Verification

- Add or update Vitest coverage for:
  - query helpers/selectors
  - optimistic mutation scaffolds
  - focus/navigation helpers
  - constants/key-builder behavior
- Run relevant UI tests where shared infrastructure changes affect panes, section focus, or layout persistence.
- Use CDP verification when infrastructure refactors affect visible pane/layout behavior.

## Acceptance Criteria

- Contributors can identify the owner of a piece of shared state or UI infrastructure quickly.
- Read helpers and mutation commands are no longer mixed inside the same giant modules by default.
- Shared infrastructure files are smaller and grouped by actual responsibility.
- Cross-cutting utilities stop being default dumping grounds for unrelated frontend behavior.
