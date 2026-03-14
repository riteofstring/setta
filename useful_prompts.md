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

Autonomous Codex frontend cleanup session prompt:

You are working in /Users/kevin/Documents/AppDevelopment/setta.clean-code-2.

Goal: clean up the authored frontend so it is easy for Codex coding agents to navigate, understand, and modify, while preserving behavior and keeping or improving performance.

This is an autonomous execution session. Work independently. Do not pause to ask me questions. Make reasonable assumptions based on the existing code, the repo instructions, and the cleanup plans below. If one slice is blocked, skip it, note the blocker briefly, and continue with the next highest-value unblocked slice.

Read these first:

- docs/plans/frontend-cleanup-plan-index.md
- docs/plans/frontend-cleanup-plan.md
- docs/plans/frontend-pages-shell-cleanup-plan.md
- docs/plans/frontend-panes-and-authoring-cleanup-plan.md
- docs/plans/frontend-sections-and-params-cleanup-plan.md
- docs/plans/frontend-state-and-shared-infrastructure-cleanup-plan.md

Treat the plans as a living baseline, not a frozen snapshot. Before picking a slice, verify the current tree and preserve any helper/module seams that already exist. If a file-size claim, hotspot list, or boundary in the docs is stale, update the docs as part of the cleanup instead of following the older snapshot blindly.

Then start implementing the cleanup. Do not spend the session writing more plans unless a small supporting doc is directly needed for implementation.

Autonomy rules:

- Prioritize agent legibility: clear module ownership, smaller files, fewer mixed responsibilities, obvious read/write boundaries, feature-local helpers, and less cross-layer jumping.
- Preserve user-visible behavior unless you find a concrete issue that should be fixed as part of the cleanup.
- Prefer incremental refactors over broad directory churn. Prove boundaries first, then move files if it clearly improves ownership.
- Make reasonable assumptions instead of asking for help.
- If a task would normally require asking me something, choose the most conservative reasonable path and document the assumption in your progress note or commit message.
- If a slice is blocked by unavailable tooling, permissions, or verification requirements, move to the next unblocked cleanup slice instead of stopping.
- Do not touch generated files under frontend/src/utils/generated\* unless absolutely required.

Execution rules:

- Start with the highest-leverage foundation work, then continue domain by domain.
- Add or update Vitest coverage for substantial refactors.
- Add Playwright coverage when interactive UI behavior changes materially.
- For visual or performance-sensitive frontend refactors, use chrome-devtools-mcp when available, do the required visual verification, and append before/after notes under perf/reports/frontend/ when the change is meaningful.
- If CDP is unavailable for a slice that truly requires it, defer that slice, note the blocker, and continue with another cleanup area.
- Commit in small logical increments with clear commit messages after each completed cleanup slice.
- Do not stop at analysis. Implement, verify, commit, and continue until there is no meaningful unblocked work left in the plans.

Tracking rules:

- If docs/plans/frontend-cleanup-execution-log.md does not exist yet on the branch, create it first, then maintain it as an append-only work log.
- After each completed slice, append:
  - date/time
  - what you changed
  - key files touched
  - tests/verification run
  - perf/CDP notes if relevant
  - commit hash
  - the next highest-value unblocked slice
- Do not rewrite earlier log entries; only append.

Suggested execution order:

1. Refresh or implement the Phase 0 foundation if it is missing or stale on the branch:
   - module map / placement rules
   - execution log
   - clearer ownership guidance for where new frontend code should live
2. Then tackle the largest current shared hotspots in the tree:
   - `state/actions/ai.ts`
   - `state/definitions.ts`
   - shared chat / project-AI surface files
3. Then continue through the remaining domains from the plans:
   - project chat windowing
   - chat / project AI / shared chat state
   - pages and shell
   - panes and authoring
   - sections and params
   - remaining runtime/infrastructure cleanup

When you get a message like “proceed with the next step”, interpret it as:

- read the execution log if it exists
- choose the next highest-value unblocked cleanup slice
- implement it end-to-end
- verify it
- commit it
- append the log
- continue until the turn ends

At the end of each turn, report:

- what slice you completed
- what files/modules now own the behavior
- what tests/verification you ran
- the commit hash
- the next slice you will take when told to proceed
