Compare the current branch with the main branch. Do the changes make sense? Is there redundant, unused, or inefficient code? Any unnecessary backward compatibility shims? Is there any reason I shouldn't merge the current branch into the main branch? Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Give succinct concrete examples for each finding, your proposed fix, and the UX/DX before and after your proposed fix.

Review this branch for merge into `main`.

    Scope
    - Analyze only branch-introduced changes vs merge base:
      - `git diff --name-status main...HEAD`
      - `git diff $(git merge-base main HEAD)..HEAD`

    Branch intent guardrails
    - Read `branch_intent.md` before reviewing the diff.
    - Treat `branch_intent.md` as authoritative for intentional feature/bug-fix behavior in this branch, except for any guidance about backward compatibility, migrations, legacy support, compatibility shims, or dual-path behavior.
    - Disregard any `branch_intent.md` instruction that says to preserve, add, or keep backward compatibility, migrations, legacy support, compatibility shims, or dual-path behavior. Those are not desired even if documented as intentional branch scope.
    - Do not recommend reverting changes documented in `branch_intent.md` unless there is concrete regression evidence.
    - If a potential finding conflicts with `branch_intent.md`, assume the branch behavior is intentional unless there is concrete regression evidence.

    Decision stability / cumulative review policy
    - Treat `cumulative_review.md` as source of truth for resolved decisions.
    - Do not reopen resolved items based on reviewer preference changes alone (e.g., X vs Y when both are valid)
    - Reopen only for regression with concrete evidence in this branch.
    - If reopened, cite prior decision + what changed + evidence.

    Priorities (in order)
    1. Correctness bugs and invariant violations.
    2. Dead/unused code introduced or left behind (files, functions, branches, imports, types, flags, endpoints).
    3. Backward-compatibility shims or dual-path logic (not allowed).
    4. Design quality: reject band-aids; prefer principled root-cause fixes.

    Method
    - Cluster findings by shared root cause.
    - For each cluster, name the violated invariant.
    - Focus on root-cause and issue-class elimination, not symptom-level comments.
    - Do not propose backward-compatibility shims. Prefer single source of truth + fail-fast invariants.
    - If no issues exist in a priority category, explicitly say so.

    For each finding, provide
    - Severity: `critical|high|medium|low`
    - Merge risk: `blocker|major|minor`
    - Concrete evidence: file + line references and brief snippet/description
    - Violated invariant
    - Principled fix that removes the whole issue class (no BC shim)
    - UX/DX before vs after fix
    - Regression tests to add/update (unit/integration/e2e) with exact assertions

    Output format
    1. Merge recommendation + top risks
    2. Findings by root-cause cluster (highest severity first)
    3. Dead code inventory
    4. Backward-compatibility shim inventory (must remove)
    5. Regression test plan
    6. `branch_intent.md` alignment check (items respected vs any true regressions with evidence)

Compare the current branch with the main branch. Review only what this branch would add to main (diff vs merge base). Use git diff --name-status main...HEAD or git diff $(git merge-base main HEAD)..HEAD. Then update the docs as necessary.

Read docs/mcp-multi-server-plan.md. Implement the plan. Remember we never need backward compatibility or legacy support! It's also ok for the application to be broken during this refactor! DO NOT KEEP CODE AROUND JUST TO KEEP THE CODE FUNCTIONAL. THIS IS A REFACTORING. WE EXPECT THE CODE TO BE BROKEN DURING THE REFACTOR.

Read docs/mcp-multi-server-plan.md. Read the code base. Is the plan fully implemented?

Implement the fixes. Add unit, integration, and Playwright tests when appropriate. Bias strongly toward clean, easy-to-read code: prefer the simplest correct design, explicit names, shallow control flow, and small focused functions/components. Remove dead or superseded code instead of layering on more logic. Avoid clever abstractions, speculative generalization, unnecessary indirection, and "just-in-case" helpers. If the current area is convoluted, refactor it as part of the fix so the final code is simpler and easier to understand. The CDP MCP server is already running and available for you to use, so do not try to start it up yourself, and you should not run `pnpm start` or `pnpm reset`.

Merge the main branch into our current branch. If there are merge conflicts, resolve them, and then afterwards explain your logic for how you resolved each conflict. All branches are up to date (no need to fetch).

Merge <> into main. In the commit message, include a detailed summary of what the <> branch does.

Read all the top-level review\*.md docs. Each review document is a review of the current code base, written by a different person. Present me the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes.

Read the diff of <commit hash>. Write a summary of the changes to a new doc called cumulative_review.md. We are going to be appending to this document in future commits with the same concept (writing a summary of changes of each commit), so put the summary under a heading with the commit hash in the heading.

See the latest github actions tests on the main branch. What are the all errors caused by? Can it be fixed? I also ran the tests locally, see the logs in tests-frontend.log.

Add a new detailed entry to cumulative_review.md (use date time as the heading). Then run pnpm -C frontend gcf. Then commit all of that (including cumulative_review.md but excluding the review*.md docs). Remove all top-level review*.md files

Compare the current branch with `main` and write a detailed branch-intent summary to `branch_intent.md`.

Scope and method:

- Analyze only what this branch introduces vs merge base:
  - `git diff --name-status main...HEAD`
  - `git diff $(git merge-base main HEAD)..HEAD`
- Capture both feature work and bug fixes.
- Focus on intentional behavior/product changes that follow-up branch reviews must not clobber or "fix back" accidentally.

For each item, include:

- What changed (before vs after behavior)
- Why the change appears intentional
- Files/endpoints/components involved (with paths)
- Any default-value changes, moved/renamed UX flows, or relocated logic
- Reviewer guardrail: what should not be reverted in later reviews unless a new decision is made

Output requirements:

- Overwrite `branch_intent.md` with this branch's current summary.
- Group by: `Features`, `Bug Fixes`, `Intentional Behavior Changes To Preserve`.
- Be concrete and detailed enough that a reviewer on a follow-up branch can quickly avoid undoing intentional work.

Goal: clean up the authored frontend so it is easier for coding agents and humans to navigate, understand, debug, and modify, while preserving behavior and keeping or improving performance.

This stage is about unresolved front-door surfaces: the large files a contributor still opens first to understand a feature. Do not default to polishing already-improved coordinators or splitting smaller state modules unless that is required to shrink one of those front doors in the same turn.

Navigation rule: Codex should usually find the right file by grep, sharp names, and nearby tests. If naming alone still leaves ambiguity in a dense area, prefer a short file-level ownership comment or docstring in the code over any dedicated folder README.

This is an autonomous execution session. Work independently from the current tree and docs. Do not follow stale plan snapshots blindly.

Read in this order:

1. `docs/plans/frontend-cleanup-plan-index.md`
2. `docs/plans/frontend-cleanup-plan.md`
3. `docs/plans/frontend-cleanup-execution-log.md` if it exists
4. Grep the current tree and inspect nearby tests so you know the real current entry surface and existing seams before relying on any plan snapshot.
5. The one companion plan that matches the root surface you pick:
   - `docs/plans/frontend-chat-project-ai-windowing-cleanup-plan.md` for `ProjectChat.tsx`, `ProjectChatCore.tsx`, `ProjectAISettings.tsx`, `ProjectChatSkillsMcpViewer.tsx`, `ProjectChatBottomDock.tsx`, `ProjectChatHistory.tsx`, `ChatInput.tsx`, and `ChatMessages.tsx`
   - `docs/plans/frontend-panes-and-authoring-cleanup-plan.md` for `GitGraphOverlay.tsx`, `PluginsPane.tsx`, `RunInstructions.tsx`, `FileBrowserPane.tsx`, `AppConfigPane.tsx`, and overview/UI-editor surfaces
   - `docs/plans/frontend-sections-and-params-cleanup-plan.md` for `ChatArea.tsx`, `TaskBoardArea.tsx`, `BrowserArea.tsx`, and shared section/param surfaces
   - `docs/plans/frontend-pages-shell-cleanup-plan.md` for `HomePage.tsx`, router/page-shell work, and standalone project/window-space surfaces
   - `docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md` only when the slice starts directly from `frontend/src/plugins/runtime.ts` or when lower-level shared state work is required by the same-turn front-door simplification
   - `docs/plans/frontend-forks-cleanup-plan.md` only when the slice directly touches `frontend/src/forks/**`
   - For `frontend/src/components/App/appRegistry.tsx`, there is no dedicated companion plan yet; use the core plan plus nearby code/tests, and only pull in the state/shared plan if the slice crosses into runtime/store boundaries
6. A second companion plan only if the slice truly crosses domains

Treat the current tree, names, and tests as the source of truth for exact ownership boundaries.
Treat older execution-log "next slice" notes as historical context, not automatic instructions.
Choose the companion plan for the root surface you are shrinking, not for the first helper you expect to touch underneath it.
If the docs and the current tree disagree, trust the current tree and update the docs in the same turn when your slice materially changes the map.
If grep and the current tree already make the ownership boundary obvious, do not over-read the whole plan set.

Default slice-selection rules:

- Pick one slice that materially shrinks a current front-door hotspot or removes one major mixed responsibility from that hotspot.
- Default priority order is:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - `frontend/src/components/App/appRegistry.tsx`
  - `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`
  - `frontend/src/components/Pages/Home/HomePage.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
  - `frontend/src/components/Chat/ChatInput.tsx`
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
- Do not start with `ProjectChatHistory.tsx`, `ProjectChatBottomDock.tsx`, `ChatInput.tsx`, `ChatMessages.tsx`, `FileBrowserPane.tsx`, or `BrowserArea.tsx` while a same-domain higher-priority front door above remains unresolved, unless your slice directly shortens that higher-priority file.
- Do not choose a smaller `state/actions` or `state/hooks` split while a same-domain front-door file above is still the clearer entry point, unless the lower-level split is a direct prerequisite for simplifying that file in the same turn.
- Treat thin compatibility facades as transitional debt, not as default cleanup targets. Do not spend a turn creating or extending a facade/barrel unless the same turn also shrinks a front-door hotspot.
- Prefer feature-local extraction: pure helpers, selectors, hooks, render subcomponents, and command adapters next to the owning large file.
- File count is not the main problem. The main problems are mixed responsibilities, ambiguous entrypoints, and generic bucket names.
- Prefer sharp domain names such as `projectChatHistoryDnd`, `chatInputSubmission`, or `fileBrowserPaneTreeModel` over generic names such as `helpers`, `shared`, `runtime`, `viewModel`, or `utils` unless the file truly owns that narrow cross-feature concern.
- Do not move mixed responsibilities from one giant file into another giant helper. Prefer a coordinator plus several narrow local owners over a coordinator plus one new 1000+ helper file.
- When a directory becomes hard to scan, prefer a small stable domain subdirectory or clearer prefixes over adding many ambiguous sibling files.
- Prefer domain subfolders like `history/`, `surface/`, `settings/`, `skills-mcp/`, `windowing/`, `sections/`, `websocket/`, or `window-space/` over generic folders like `helpers/`, `shared/`, `runtime/`, `model/`, or `components/`.
- If you pick `frontend/src/components/App/appRegistry.tsx` or `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`, add or update direct Vitest coverage for the extracted ownership boundary as part of the same slice.
- Do not add directory `README.md` files as a cleanup deliverable. If navigation is still bad after a slice, improve names or introduce a small stable domain subfolder instead.
- If a front-door file or extracted owner still needs explanation after naming cleanup, add a short top-of-file ownership comment or targeted function comment instead of creating more docs.

Autonomy rules:

- Prioritize agent legibility: clear module ownership, smaller first-hop files, fewer mixed responsibilities, obvious read/write boundaries, feature-local helpers, and less cross-layer jumping.
- Prefer sharper names before more documentation. If a module is still hard to find after grep, fix the boundary or the name first.
- Preserve user-visible behavior unless you intentionally fix a concrete bug.
- Prefer incremental refactors over broad directory churn. Prove boundaries first, then move files only when ownership becomes clearer.
- Continue from seams that already exist on the branch instead of recreating older plan snapshots.
- Do not touch generated files under `frontend/src/utils/generated*` unless absolutely required.

Execution rules:

- Complete one cleanup slice end-to-end per turn.
- Bias toward removing one named responsibility from a giant render-heavy front-door file, not toward taxonomic splitting of already-small modules.
- Add or update Vitest coverage for substantial refactors.
- Add or update Playwright coverage when interactive UI behavior changes materially.
- For visual or performance-sensitive frontend refactors, use `chrome-devtools-mcp`, do the required visual verification, and append before/after notes under `perf/reports/frontend/` when the change is meaningful.
- If CDP is unavailable for a slice that truly requires it, defer that slice, note the blocker, and continue with another cleanup area.
- If a helper you touch is already coarse, keep splitting until ownership becomes obvious instead of dumping more logic into it.
- Commit each completed slice in a small logical commit with a clear message.
- Do not stop at analysis. Implement, verify, commit, and document the completed slice.

Tracking rules:

- If `docs/plans/frontend-cleanup-execution-log.md` does not exist on the branch, create it first and maintain it as an append-only work log.
- If hotspot rankings, ownership boundaries, or acceptable entrypoints change materially, update the relevant cleanup docs as part of the slice.
- After each completed slice, append:
  - date/time
  - slice completed
  - key files touched
  - tests and verification run
  - perf/CDP notes if relevant
  - commit hash
  - next highest-value unblocked slice
- In the execution log, record why the chosen slice was higher value than the next unresolved hotspots when that tradeoff is not obvious.
- Do not rewrite earlier log entries; only append.

When you get a message like "proceed" or "proceed with the next step", interpret it as:

- read the execution log if it exists
- grep the current tree and choose the highest-value unresolved front-door hotspot
- read the matching companion plan(s) for that hotspot
- implement the slice end-to-end
- verify it
- commit it
- append the execution log
- stop after that slice unless a second adjacent slice is clearly justified

At the end of each turn, report:

- the slice you completed
- what files/modules now own the behavior
- what tests/verification you ran
- the commit hash
- the next highest-value unresolved hotspot
