# Frontend Cleanup Plan

## Goal
Make the authored frontend easy for Codex agents and humans to navigate, change, and profile without a big-bang rewrite or user-visible behavior changes.

## What "Clean" Means Here
- A contributor should be able to answer "where does this behavior live?" within a few file opens.
- Render components should mostly describe UI, not also fetch data, mutate multiple stores, parse protocol payloads, and manage timers.
- State writes should happen through small, named domain commands instead of ad hoc `getState()` / `setState()` reach-through from many places.
- Expensive derivation should live in pure functions or selectors with tests, then feed lightweight React components.
- Performance work should be measured with existing Vitest/Playwright coverage plus CDP/`perf/reports` profiling for significant refactors.

## Scope
- In scope:
  - Authored frontend code under `frontend/src/components`, `frontend/src/state`, `frontend/src/plugins`, and non-generated UI helpers in `frontend/src/utils`
  - Refactors that improve readability, feature ownership, and render/update performance
  - Documentation that helps agents quickly find the right file, state owner, and test entry points
- Out of scope for the first pass:
  - `frontend/src/utils/generated*`
  - `frontend/src/forks/**`
  - visual redesigns
  - backend API/schema changes
  - repo-wide folder moves before boundaries are proven

## Current State (Observed)
- The biggest readability problem is mixed responsibilities inside large files, not just file count.
- There are 46 non-generated TS/TSX files at 1000+ lines; several production hotspots are well above 2000 lines.
- Chat and project-AI code is the densest cluster:
  - `frontend/src/components/Chat/ChatMessages.tsx` at 6581 lines
  - `frontend/src/components/Chat/ChatInput.tsx` at 2766 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` at 2691 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` at 2261 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx` at 3302 lines
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` at 4816 lines
- The file/browser and section layout path has similar coupling:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx` at 2363 lines
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx` at 2307 lines
  - `frontend/src/components/Section/Layouts/ChatArea.tsx` at 1873 lines
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx` at 2304 lines
- `frontend/src/state/actions/ai.ts` at 4263 lines currently mixes transcription, config loading, API key management, agent-run loading, chat hydration, streaming, optimistic updates, and stop/resume behavior.
- `frontend/src/state/definitions.ts` exports 45 `use*` stores, which makes store ownership and selector boundaries hard to understand.
- Components and hooks frequently import generated endpoints/types and large action modules directly, which increases context switching and makes it harder for agents to see the true domain boundary.
- Direct store reach-through is common enough that mutation paths are not obvious from component names alone.

## Guiding Principles
1. Prefer feature ownership over file-type ownership.
Each feature should have an obvious home for UI, selectors, commands, transport helpers, and tests.

2. Prefer small explicit APIs over broad shared modules.
New code should depend on a narrow feature surface, not on mega-files like `state/actions/ai.ts`.

3. Separate pure derivation from effects and rendering.
If logic can be tested without React, move it out of the component tree.

4. Keep generated code as the source of truth, but wrap it.
Use typed feature-local adapters around generated routes/types instead of pulling `route_*` calls deep into leaf components.

5. Avoid big-bang moves.
Refactor one hotspot at a time, keep behavior stable, and only move files after a smaller API boundary has settled.

6. Measure performance before and after meaningful refactors.
For high-impact surfaces, append results under `perf/reports/frontend/` and use CDP profiling to confirm the cleanup did not regress large-DOM behavior.

## Target Shape
For major hotspots, aim for a feature-local shape like this:

```text
<feature>/
  README.md
  components/
  hooks/
  selectors/
  commands/
  api/
  model/
  *.test.ts(x)
  *.perf.test.ts(x)
```

Notes:
- This is a target shape, not a mandatory first-step directory migration.
- Keep truly generic primitives in shared locations.
- Prefer explicit imports from owning modules over large barrel files.

## Phase 0: Guardrails And Mapping
- Create a short frontend module map doc that tells agents where chat, project chat, browser/file management, app runtime, plugin runtime, and shared stores live.
- Add clear "where new code goes" rules:
  - feature-local helpers stay with the feature
  - `utils/` is reserved for low-level cross-feature helpers
  - shared store definitions and selectors must name their owning feature
- Define file-size guidance:
  - preferred: under 500 lines for new/refactored production files
  - review threshold: 800 lines
  - exceptions must be deliberate and documented
- Define a small set of allowed patterns for store access, selector creation, transport wrappers, and test placement so Codex agents are not guessing.

## Phase 1: Split The Chat Domain First
- Start with the highest-traffic shared path:
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
  - `frontend/src/state/actions/ai.ts`
- Break `ChatMessages.tsx` into distinct modules:
  - message content rendering
  - assistant activity/timeline rendering
  - structured output formatting
  - attachment preview/loading
  - copy/export helpers
  - timers and animation hooks
- Break `ChatInput.tsx` into:
  - composer state
  - attachment handling
  - slash command resolution
  - dictation/transcription controls
  - presentational subcomponents
- Split `state/actions/ai.ts` into domain commands with obvious names such as:
  - chat submission/editing
  - chat hydration
  - chat streaming reducers
  - agent runs
  - engine/config loading
  - transcription
- Keep the existing chat virtualization work aligned with this phase by treating [chat-message-list-virtualization-plan.md](./chat-message-list-virtualization-plan.md) as part of the same chat cleanup track.

## Phase 2: Make Store Ownership Obvious
- Split `frontend/src/state/definitions.ts` by domain or add domain-local store modules that re-export the minimal surface needed by callers.
- Add selectors next to stores so components read derived data through named helpers instead of reconstructing it inline.
- Reduce component-level `useStore.getState()` / `useStore.setState()` calls, especially in render-heavy UI surfaces.
- Prefer named command functions for mutations so the write path is easy to locate.
- Keep Zustand, but tighten access patterns instead of introducing a new state library.

## Phase 3: Simplify Project Chat Windowing
- Refactor `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` and `frontend/src/state/actions/projectChatWindowing.ts`.
- Separate:
  - layout math
  - pointer/keyboard interaction state
  - persisted windowing mutations
  - render shells
  - animation state
- Move reusable calculations into pure modules with focused tests.
- Keep performance front and center for drag/resize and large multi-window scenarios.

## Phase 4: Clean Up File Browser And Section Layouts
- Refactor:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`
- Separate data loading/filtering/preview resolution from rendering.
- Keep virtualization and large-folder behavior explicit and measurable.
- Push expensive path/filter/search derivation into tested helpers/selectors before React render.
- Reduce wrapper depth where possible to keep DOM shape flatter.

## Phase 5: Simplify App And Plugin Runtime Surfaces
- Refactor:
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/plugins/runtime.ts`
- Separate runtime registry concerns from renderers, bindings, capability checks, and markdown/media helpers.
- Document the extension points clearly so agents know where to add new runtime component types or plugin hooks.

## Phase 6: Put Documentation Next To Code
- Add short `README.md` files for the major feature roots touched during cleanup.
- Each README should answer:
  - what this feature owns
  - main entry components
  - primary stores/selectors/commands
  - generated API dependencies
  - most relevant tests
- This is high leverage for Codex agents because it reduces "search the tree until something looks right" work.

## Verification Strategy
- For each substantial refactor:
  - add or update Vitest coverage around extracted pure logic and selectors
  - add or update Playwright coverage for user-facing flows when the surface is interactive
  - run CDP profiling/visual verification when the refactor touches UI behavior or performance-sensitive rendering
  - append before/after notes to `perf/reports/frontend/` for meaningful performance changes
- Prefer stable performance guardrails such as DOM size, render counts, selector churn, or virtualization behavior over fragile timing-only assertions.

## Success Criteria
- Major frontend features have obvious entry points, state owners, and mutation paths.
- New contributors and coding agents can usually identify the right file to change without opening a large cluster of unrelated files.
- Large shared surfaces no longer combine transport, state mutation, heavy derivation, and rendering in a single file.
- Render-heavy flows remain at least as fast as today, with before/after profiling recorded for significant refactors.
- The repo gains durable local guidance so future code does not collapse back into mega-files.

## Recommended Execution Order
1. Write the module map and placement rules.
2. Split `state/actions/ai.ts` and the shared chat files.
3. Refactor `ProjectChatBottomDock.tsx` and `projectChatWindowing.ts`.
4. Clean up file browser and section layout hotspots.
5. Split `appRegistry.tsx` and `plugins/runtime.ts`.
6. Add feature READMEs as each area stabilizes.

## Notes
- Do not start with a repo-wide `features/` migration. Prove the boundaries first, then move files if the new structure is clearly better.
- Generated endpoints/types should remain the source of truth; the cleanup should make them easier to consume, not replace them.
- If a refactor meaningfully changes performance-sensitive surfaces, baseline first with CDP and keep the results in `perf/`.
