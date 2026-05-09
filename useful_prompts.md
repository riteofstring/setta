Compare the current branch with the go-rewrite branch. Do the changes make sense? Is there redundant, unused, or inefficient code? Any unnecessary backward compatibility shims? Is there any reason I shouldn't merge the current branch into the go-rewrite branch? Review only what this branch would add to go-rewrite (diff vs merge base). Use git diff --name-status go-rewrite...HEAD or git diff $(git merge-base go-rewrite HEAD)..HEAD. Give succinct concrete examples for each finding, your proposed fix, and the UX/DX before and after your proposed fix.

Review this branch for merge into `go-rewrite`.
 
    Scope
    - Analyze only branch-introduced changes vs merge base:
      - `git diff --name-status go-rewrite...HEAD`
      - `git diff $(git merge-base go-rewrite HEAD)..HEAD`

    Lens
    - This is a correctness / invariants review.
    - Focus on correctness bugs, invariant violations, regressions after prior fixes, and missing tests that would let those regressions recur.
    - Ignore dead code, shims, and simplification opportunities unless they directly create a correctness failure.

    Guardrails
    - Read `branch_intent.md`. Treat documented branch behavior as intentional unless there is concrete regression evidence. Ignore any instruction to preserve backward compatibility, migrations, legacy support, shims, or dual-path behavior.
    - Use `cumulative_review.md` as prior-decision context for recurring areas. Do not reopen resolved items for preference reasons; reopen only for concrete regression with evidence.
    - Leave the repository clean except for top-level `review1.md`, `review2.md`, and `review3.md`. Remove any verification artifacts you create.
 
    Method
    - Cluster findings by shared root cause.
    - For each cluster, name the violated invariant.
    - Focus on root-cause and issue-class elimination, not symptom-level comments.
    - Prefer the smallest owner-level fix that makes the invariant true everywhere.
    - If no actionable correctness / invariant issues exist, say so explicitly.
 
    For each actionable finding, provide
    - Severity: `critical|high|medium|low`
    - Merge risk: `blocker|major|minor`
    - Concrete evidence: file + line references and brief description
    - Violated invariant
    - Classification: `new issue | regression after prior fix | adjacent fallout in same subsystem`
    - Principled fix that removes the whole issue class (no BC shim)
    - Regression tests to add/update (unit/integration/e2e) with exact assertions
 
    Output format
    1. `Lens: correctness/invariants`
    2. Either `No actionable findings.` or findings by root-cause cluster (highest severity first)

Review this branch for merge into `go-rewrite`.

    Scope
    - Analyze only branch-introduced changes vs merge base:
      - `git diff --name-status go-rewrite...HEAD`
      - `git diff $(git merge-base go-rewrite HEAD)..HEAD`

    Lens
    - This is a dead code / shims / simplification review.
    - Focus on dead or unused code, backward-compatibility shims, dual-path behavior, duplicated logic, unnecessary wrappers, and cases where a smaller owner-level rewrite would reduce future bug surface.
    - Do not report style nits or speculative refactors. Only report cleanup / simplification findings that materially reduce maintenance risk, issue-class surface, or future diff growth.
    - Leave pure correctness-only issues to the two correctness reviewers unless the cleanup problem directly causes the bug.

    Guardrails
    - Read `branch_intent.md`. Treat documented branch behavior as intentional unless there is concrete regression evidence. Ignore any instruction to preserve backward compatibility, migrations, legacy support, shims, or dual-path behavior.
    - Use `cumulative_review.md` as prior-decision context for recurring areas.
    - Leave the repository clean except for top-level `review1.md`, `review2.md`, and `review3.md`. Remove any verification artifacts you create.

    Method
    - Cluster findings by shared root cause.
    - Focus on issue-class elimination and diff reduction, not on layering new wrappers or helper code.
    - Prefer deleting dead or superseded code, collapsing duplicate branches, tightening ownership, and removing dual-path behavior.
    - If no actionable cleanup / simplification issues exist, say so explicitly.

    For each actionable finding, provide
    - Severity: `critical|high|medium|low`
    - Merge risk: `blocker|major|minor`
    - Concrete evidence: file + line references and brief description
    - Cleanup / simplification invariant being violated
    - Classification: `new issue | regression after prior fix | adjacent fallout in same subsystem`
    - Principled simplification or deletion that removes the whole issue class
    - Regression tests to keep or add so the simplification stays safe

    Output format
    1. `Lens: dead-code/shims/simplification`
    2. Either `No actionable findings.` or findings by root-cause cluster (highest severity first)


Compare the current branch with the go-rewrite branch. Review only what this branch would add to go-rewrite (diff vs merge base). Use git diff --name-status go-rewrite...HEAD or git diff $(git merge-base go-rewrite HEAD)..HEAD. Then update the docs as necessary.

Read docs/mcp-multi-server-plan.md. Implement the plan. Remember we never need backward compatibility or legacy support! It's also ok for the application to be broken during this refactor! DO NOT KEEP CODE AROUND JUST TO KEEP THE CODE FUNCTIONAL. THIS IS A REFACTORING. WE EXPECT THE CODE TO BE BROKEN DURING THE REFACTOR.

Read docs/mcp-multi-server-plan.md. Read the code base. Is the plan fully implemented?

Implement the fixes. Prefer owner-level, issue-class elimination over patching symptoms at multiple call sites. Keep the result smaller and simpler where possible: remove dead or superseded code, avoid speculative abstractions, wrapper growth, compatibility shims, and dual-path behavior. If a finding touches a subsystem called out in the recurring matrix at the top of `cumulative_review.md`, fix that invariant rather than only the local symptom, and extend the proof tests for that subsystem. Add unit, integration, and Playwright tests when appropriate. When browser/CDP visual verification is needed, use `./aireset.sh` and stop that session afterwards. If UI behavior changed, browser verification counts only if one affected flow actually ran end-to-end in Playwright or CDP. Before finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, then fix any issues they surface against the current worktree. Do not update `cumulative_review.md`, remove the top-level `review*.md` files, or commit. Do not run `pnpm start` or `pnpm reset`.

Simplify the current iteration's uncommitted fixes before commit. Read the current iteration's consolidated findings and fix-stage response first. Preserve the behavior, invariants, and test expectations they establish. Review only the current uncommitted diff vs `HEAD`, and touch only files already changed in this iteration unless a narrowly related cleanup is required to complete a simplification safely. Reduce code and issue-class surface without weakening the fixes. Prefer deleting dead or superseded code, collapsing duplicated branches, flattening control flow, tightening ownership, and smaller owner-level rewrites. Do not add compatibility shims, fallback paths, or "just in case" helpers. The loop rejects this pass if it adds new repo paths or increases pending inserted lines. Re-run the focused tests needed after the simplification. When browser/CDP visual verification is needed, use `./aireset.sh` and stop that session afterwards. Before finishing, run `pnpm -C frontend gcf` and `./check_quality.sh`, then fix any issues they surface against the current simplified worktree. Do not update `cumulative_review.md`, do not commit, and do not remove the top-level `review*.md` files.

Merge the go-rewrite branch into our current branch. If there are merge conflicts, resolve them, and then afterwards explain your logic for how you resolved each conflict. All branches are up to date (no need to fetch).

Merge <> into go-rewrite. In the commit message, include a detailed summary of what the <> branch does.

Read all the top-level review*.md docs. Each review document is a review of the current code base, written by a different person. The three reviews intentionally use different lenses: two correctness / invariants reviews and one dead-code / shims / simplification review. Treat missing commentary outside a reviewer's specialty area as neutral rather than a conflict by itself. Start with `CONSOLIDATED_STATUS: NO_FINDINGS` or `CONSOLIDATED_STATUS: FINDINGS_PRESENT`. If the status is `NO_FINDINGS`, briefly explain why the three reviews add up to no actionable findings, and call out any caveats or blocked verification worth knowing before merge. If the status is `FINDINGS_PRESENT`, cluster findings by root cause, tie each cluster to the recurring subsystem invariant in `cumulative_review.md` or label it `new subsystem: <name>` if none fits, and include classification (`new issue | regression after prior fix | adjacent fallout`), concrete evidence, principled fix, and exact regression tests. End with blocked verification / residual risk.

Read the diff of <commit hash>. Write a summary of the changes to a new doc called cumulative_review.md. We are going to be appending to this document in future commits with the same concept (writing a summary of changes of each commit), so put the summary under a heading with the commit hash in the heading.

See the latest github actions tests on the go-rewrite branch. What are the all errors caused by? Can it be fixed? I also ran the tests locally, see the logs in tests-frontend.log.

The current simplified worktree is authoritative. Do not change code, tests, generated files, or rerun `pnpm -C frontend gcf` / `./check_quality.sh` in this stage. Only finish the iteration metadata: update `cumulative_review.md` for any touched or new recurring subsystems, refresh `Last finding commit` and unverified notes using the current pre-finalization `HEAD`, append the dated entry, remove the top-level `review*.md` files, make sure any earlier `./aireset.sh` session is stopped, and commit all remaining changes except `review*.md`. Keep it factual. Be explicit about blocked verification and browser-verification status.

Compare the current branch with `go-rewrite` and write a detailed branch-intent summary to `branch_intent.md`.

  Scope and method:
  - Analyze only what this branch introduces vs merge base:
    - `git diff --name-status go-rewrite...HEAD`
    - `git diff $(git merge-base go-rewrite HEAD)..HEAD`
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
