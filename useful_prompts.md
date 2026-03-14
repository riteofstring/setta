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

Read all the top-level review*.md docs. Each review document is a review of the current code base, written by a different person. Present me the consolidated findings, including the proposed fixes, and the UX/DX before/after the proposed fixes.

Read the diff of <commit hash>. Write a summary of the changes to a new doc called cumulative_review.md. We are going to be appending to this document in future commits with the same concept (writing a summary of changes of each commit), so put the summary under a heading with the commit hash in the heading.

See the latest github actions tests on the main branch. What are the all errors caused by? Can it be fixed? I also ran the tests locally, see the logs in tests-frontend.log.

For Go backend rewrite work, start with `docs/plans/go-backend-rewrite/CURRENT.md`.

Treat these as the primary current docs:
- `docs/plans/go-backend-rewrite/CURRENT.md`
- `docs/plans/go-backend-rewrite/caller-backed-backend-surface-checklist.md`
- `docs/plans/go-backend-rewrite/backend-capability-coverage-checklist.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/testing-strategy.md`
- any task-specific slice doc that `CURRENT.md` points you to

Treat `docs/plans/go-backend-rewrite/archive/` as secondary reference only.

Read order:
1. Read `docs/plans/go-backend-rewrite/CURRENT.md`.
2. Read only the task-matching docs:
   - `caller-backed-backend-surface-checklist.md` for active caller reachability
   - `backend-capability-coverage-checklist.md` for runtime/service ownership
   - `go-backend-rewrite-plan.md` for clean-break and port-vs-redesign decisions
   - `testing-strategy.md` when changing code, behavior, or verification
   - `go-dependency-inventory-and-rationale.md` plus `docs/reference/dependencies/` when dependency, provider, transport, or library choices matter
   - `setta-listener-protocol-redesign-plan.md` or `go-frontend-binding-generation-plan.md` only when the task crosses those boundaries
3. Use `docs/plans/go-backend-rewrite/README.md` only for the folder map.
4. Use `docs/plans/go-backend-rewrite/*-audit-plan.md` only when editing the matching checklist.
5. Use `archive/` only when current docs and code are not enough and you need historical rationale.
6. If a checklist is large, jump straight to the relevant subsystem with search.

Working rules:
- If docs disagree with current code/tests, trust the code/tests for actual current behavior and update the docs.
- This is a clean break. Do not preserve backward compatibility, legacy route shapes, migrations, storage compatibility, or Python-shaped architecture unless I explicitly ask.
- Preserve capability and user-visible behavior, not Python implementation details.
- Preserve active product behavior for current callers first. Use Python code, tests, and docs as reference for behavior and edge cases, not as a compatibility contract.
- Default to a behavior-first, architecture-conservative port. Reopen redesign only when correctness, testability, or active caller coverage requires it.
- Prefer explicit ownership, thin transports, typed boundaries, robust source-of-truth paths, and established libraries over heuristics or transitional glue.
- Do not widen scope unless a concrete caller, workflow, runtime issue, or documented product decision requires it.

Execution expectations:
1. Inspect the current Go code, tests, and transport/runtime path first. Read Python only when needed as reference.
2. Map the task to the relevant caller-backed surface, ownership bucket, and any documented Python/shared/external boundary.
3. In your first substantive update, summarize the relevant checklist rows, code paths, doc evidence, boundary implications, and the single highest-leverage next step.
4. Execute that step end-to-end unless the task is itself planning or inventory work.
5. Update the relevant source-of-truth docs in the same change when ownership, caller reachability, dependency decisions, or workflow guidance changed.

While working:
- Read the relevant current Go code, tests, and rewrite docs before touching a subsystem.
- If the work changes caller reachability or ownership, update `caller-backed-backend-surface-checklist.md` and/or `backend-capability-coverage-checklist.md`.
- Update `CURRENT.md` only when the doc map, clean-break defaults, or workflow guidance changed.
- Do not create a new numbered phase or spike doc unless a concrete issue or caller opens a bounded rewrite slice.
- If the task touches Go-to-TypeScript frontend binding generation, keep the canonical generated outputs Go-owned. Prefer Go DTOs and converter rules over handwritten TypeScript or shadow outputs.
- Run the most relevant tests for the touched area, or explicitly state why they were not run.
- If blocked by a real architecture or product tradeoff, present one recommended option with rationale and stop. Otherwise keep executing.
- Do not ask me to restate rewrite context unless the local state is genuinely ambiguous.

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
