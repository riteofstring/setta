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

Read docs/plans/go-backend-rewrite/backend-gap-closure-plan.md and continue its executable backend parity-discovery loop. You may use up to 5 subagents when useful. Commit frequently.

Never treat plan text, parity-matrix counts, or already-green existing scenarios as completion evidence.

1. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main`.
2. Run `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`, or record a concrete baseline/harness blocker.

If either command mismatches or is blocked:
3. Fix it or classify it explicitly.
4. Any classification must cite source evidence, live-caller evidence, and why this is not a current Go-owned parity gap.
5. Add/update focused tests and update the parity matrix/docs.
6. Re-run until green or explicitly blocked.

If both commands are green:
7. Pick one high-risk surface still covered mainly by inspection, retained-boundary claims, dormant/unproven callers, or a lossy harness summary. Prefer a different top-level backend area than the most recent successful slice only as a tie-breaker; do not treat touching each area once as meaningful completion evidence.
8. Add or strengthen at least one executable parity slice from source evidence (`tests/`, `docs/reference/`, routes/public APIs, runtime/helper behavior). A slice only counts if it deepens proof for a concrete caller-visible contract, error contract, persisted-state rule, or realtime behavior. Prefer strengthening scenarios that currently compare only counts/booleans when a richer caller-visible contract exists.
9. Run it against `main`.
10. Fix or classify any mismatch it reveals, then update tests/matrix/docs and commit.

Report the exact commands run and their outcomes.

Only reply `No new executable parity gaps found` if the required parity commands are green and you either added/strengthened a parity slice this session or explained with evidence why no higher-value deepening slice could responsibly be added.


Queued follow-up prompt for the same session:

Automated message: continue the executable backend parity-discovery loop in docs/plans/go-backend-rewrite/backend-gap-closure-plan.md. You may use up to 5 subagents when useful. Commit frequently.

First compare the current `HEAD` and worktree state with the last successful parity report in this session.

If `HEAD` is unchanged, the worktree is clean, and that prior report for this `HEAD` already:
- showed both required parity commands green, and
- added/strengthened a parity slice or gave an evidence-backed reason no responsible slice could be added,

reply exactly:
`No new executable parity gaps found for unchanged HEAD <sha>`

Otherwise:
1. Be incremental by default. If this `HEAD` already has a successful report with both required parity commands green, do not rerun the full manifests yet. Continue from the active mismatch or new parity slice using `./scripts/run-backend-differential-parity.sh --baseline-ref main --only <scenario>` plus targeted tests.
2. If this `HEAD` does not yet have a successful full-manifest report in this session, run:
   - `./scripts/run-backend-differential-parity.sh --baseline-ref main`
   - `./scripts/run-backend-differential-parity.sh --baseline-ref main --manifest scripts/backend-differential-parity-corpus-scenarios.yaml`
   or record a concrete baseline/harness blocker.
3. If a scenario mismatches or is blocked: fix it or classify it with source evidence, live-caller evidence, and why it is not a current Go-owned parity gap; add/update focused tests and matrix/docs; iterate with `--only <scenario>` until that slice is green or explicitly blocked.
4. If the current queue is green, add or strengthen one executable parity slice for a high-risk surface still covered mainly by inspection, retained-boundary claims, dormant/unproven callers, or a lossy harness summary; use top-level backend area rotation only as a tie-breaker, not as completion evidence; make the slice deepen proof for a concrete caller-visible contract, error contract, persisted-state rule, or realtime behavior; run it against `main`; fix/classify any mismatch; update tests/matrix/docs and commit.
5. Before giving the next successful completion report for a changed `HEAD`, rerun both required full parity commands for that `HEAD` and report their outcomes.

Report the exact commands run and their outcomes.

Never treat plan text, matrix counts, already-green existing scenarios, or touching each top-level backend area once as completion evidence. Only reply `No new executable parity gaps found` if the required parity commands are green and you either added/strengthened a parity slice this session or explained with evidence why no higher-value deepening slice could responsibly be added.


Go backend proactive gap-hunt session starter:

Read `docs/plans/go-backend-rewrite/backend-behavior-parity-matrix-plan.md`, `docs/plans/go-backend-rewrite/backend-gap-closure-plan.md`, and `docs/plans/go-backend-rewrite/backend-behavior-parity-matrix.md`. This loop exists to proactively find real Go implementation gaps efficiently. You may use up to 5 subagents when useful. Commit frequently.

This is not the routine green-manifest maintenance loop. Never spend the whole session only rerunning the existing default or corpus parity manifests unless you are confirming a just-changed `HEAD` or resolving an active mismatch. Already-green scenarios are not progress.

1. Start with Pass 3 and Pass 4 from `backend-behavior-parity-matrix-plan.md`: skeptical omission audit plus gap triage.
2. Build a shortlist of at least 5 concrete candidate gaps from deterministic source evidence. Prefer:
   - Python tests with no narrow matrix row or no narrow Go proof
   - `docs/reference/` contracts with no narrow matrix row
   - broad `Proved` rows whose cited proof is only one broad Go test, one lossy differential summary, or one family member
   - `Dormant / unproven caller`, `Retained Python boundary`, or `Intentional divergence` rows that may now have live caller evidence or surviving Go-owned behavior
   - accepted discriminator families or mode branches that look only partially proved
3. Rank candidates by current caller risk and by probability of surfacing a concrete mismatch quickly.
4. Work the best candidates one after another until you either land a real gap or rule out the top candidates with source evidence, caller evidence, and Go-code evidence. Do not stop after auditing only one false lead.
5. For each candidate, prefer adding executable proof before changing code: a targeted parity scenario, focused Go/Python/frontend/Playwright test, or a narrow transport/runtime check that can fail on current `HEAD`.
6. If that proof reveals a mismatch, fix the Go behavior or classify it explicitly as an intentional divergence or retained Python boundary. Any classification must explain why the behavior is not a current Go-owned gap.
7. Update focused tests plus the parity matrix/docs in the same change.
8. Run targeted parity and test commands for the touched slice. Run the full default/corpus parity manifests only when needed to confirm a changed `HEAD` or close an active mismatch queue; do not make them the main task.

Session completion rules:
- A successful session must produce at least one of:
  - a newly discovered Go parity gap that is fixed
  - a newly discovered gap that is explicitly classified with evidence
  - or an evidence-backed shortlist of the next 3 unresolved high-value candidates after auditing at least 5 candidates this session
- Report the exact commands run, the candidate list, what was ruled out, and what real gap or next targets remain.
- Only reply `No new high-confidence gap leads found` if you audited at least 5 candidates from deterministic sources, added or strengthened proof where responsible, and can explain why the remaining leads are lower value than the ones ruled out.


Queued follow-up prompt for the same proactive gap-hunt session:

Automated message: continue the proactive backend gap-hunt loop. You may use up to 5 subagents when useful. Commit frequently.

First compare the current `HEAD`, worktree state, and candidate backlog with the last successful report in this session.

If `HEAD` is unchanged, the worktree is clean, and that prior report for this `HEAD` already audited at least 5 deterministic-source candidates and either landed a concrete gap or left an evidence-backed next-candidate shortlist, reply exactly:
`No new high-confidence gap leads found for unchanged HEAD <sha>`

Otherwise:
1. Continue from the prior candidate backlog first. Do not restart from the green default manifest unless the `HEAD` changed and you need parity confirmation for code you just changed.
2. Keep skeptical-omission pressure. If the backlog is exhausted, mine at least 3 new candidates from deterministic sources before declaring the session done.
3. Prefer targeted proof and `./scripts/run-backend-differential-parity.sh --baseline-ref main --only <scenario>` or focused tests over full-manifest reruns.
4. If a proof mismatches, fix or classify it, update focused tests plus matrix/docs, and iterate until that slice is green or explicitly blocked.
5. Before the next successful report for a changed `HEAD` that touched behavior or added new proof, run the targeted parity and tests that validate the touched slice. Run the full default/corpus manifests only if that `HEAD` still needs broad confirmation.
6. Report the exact commands run, candidate-list changes, ruled-out leads, and the current best unresolved candidates.

Never treat old green scenarios, matrix counts, or touching each area once as completion evidence. The point of this loop is to surface new high-value gaps quickly, not to re-prove the old queue.
 
