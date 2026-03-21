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

In this branch the Go rewrite is broad but not behaviorally closed. Start with `docs/plans/go-backend-rewrite/backend-behavior-parity-matrix.md` and treat it as the source of truth for remaining rewrite debt.

Work from rows marked `Missing` or `Implemented, proof incomplete`. Pick one small coherent slice of active, caller-backed gaps and close it end-to-end:
- read the cited source-baseline evidence plus the current Go code/tests and current frontend callers
- implement the missing behavior or, if the product should differ now, document it as an intentional divergence with proof
- add or update the relevant Go, Python, frontend, Playwright, or doc tests
- update the parity matrix and any touched source-of-truth docs in the same change

Prioritize active product/runtime gaps over dormant legacy transports. Read Go code/tests first; read Python only as behavior reference or for retained Python boundaries. Preserve current callers and documented product behavior, not incidental Python implementation details. Do not ask me to restate rewrite context unless the local state is genuinely ambiguous. Run the most relevant tests, and in your final summary tell me which matrix rows moved and what remains for the chosen slice.

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



Merge main into this branch. The main branch is still using a python backend, while this branch is rewriting the entire backend in Go. Therefore, the main goal of merging main into this branch is to make sure we keep our Go rewrite "up to date" in terms of features etc.


Go backend parity closing session starter:

Read docs/plans/go-backend-rewrite/backend-gap-closure-plan.md and continue the executable backend parity-discovery loop it defines. You may use up to 5 subagents when useful. Commit your work frequently.

Do not treat the plan text or parity-matrix status counts alone as completion evidence.

First:
1. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main`.
2. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`, or if that check is blocked by a baseline/harness problem, record the blocker explicitly instead of claiming completion.

If either command finds a mismatch or blocker:
3. Fix or explicitly classify it.
4. Add/update focused tests and update the parity matrix/docs.
5. Re-run until green or explicitly blocked.

If both commands are green:
6. Do not stop. Pick one high-risk surface from the plan's next-expansion backlog, retained Python boundary rows, or dormant/unproven caller rows that is still mostly covered by inspection rather than executable proof.
7. Derive at least one new executable parity scenario from source-baseline evidence (`tests/`, `docs/reference/`, routes/public APIs, or helper/runtime behavior).
8. Implement that scenario in the differential harness or corpus manifest.
9. Run it against `main`.
10. Fix or explicitly classify any mismatch it reveals, then update tests/matrix/docs and commit.

Report the exact commands run and their outcomes.

Only reply `No new executable parity gaps found` if:
- the required existing parity commands are green, and
- you either added a new executable parity slice this session or explicitly explained why no responsible new slice could be added.


Queued follow-up prompt for the same session:

Automated message: continue the executable backend parity-discovery loop described in docs/plans/go-backend-rewrite/backend-gap-closure-plan.md. You may use up to 5 subagents when useful. Commit your work frequently.

First check whether the current `HEAD` commit or worktree state has changed since the last successful parity report in this session.

If the immediately previous successful report in this session already showed both of these commands green for the current `HEAD`, and the worktree is still clean, do not rerun them:
- `./scripts/run-backend-differential-parity.sh --baseline-ref main`
- `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`

If that same prior report also already added a new executable parity slice for this `HEAD`, or explicitly explained why no responsible new slice could be added, just reply:
`No new executable parity gaps found for unchanged HEAD <sha>`

Otherwise:
1. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main`.
2. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`, or if that check is blocked by a baseline/harness problem, record the blocker explicitly instead of claiming completion.

If either command finds a mismatch or blocker:
3. Fix or explicitly classify it.
4. Add/update focused tests and update the parity matrix/docs.
5. Re-run until green or explicitly blocked.

If both commands are green:
6. Do not stop. Pick one high-risk surface from the plan's next-expansion backlog, retained Python boundary rows, or dormant/unproven caller rows that is still mostly covered by inspection rather than executable proof.
7. Derive at least one new executable parity scenario from source-baseline evidence (`tests/`, `docs/reference/`, routes/public APIs, or helper/runtime behavior).
8. Implement that scenario in the differential harness or corpus manifest.
9. Run it against `main`.
10. Fix or explicitly classify any mismatch it reveals, then update tests/matrix/docs and commit.

Report the exact commands run and their outcomes.

Do not treat the plan text or matrix counts alone as completion evidence.
Only reply `No new executable parity gaps found` if:
- the required existing parity commands are green, and
- you either added a new executable parity slice this session or explicitly explained why no responsible new slice could be added.
 
