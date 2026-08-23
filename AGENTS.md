## Authority and communication

- One locally installed Code Polishy release owns shared enforcement. Run it as
  `code-polishy`; `.code-polishy.lock.json` names the exact release this
  repository requires, and changing which release governs the repository is a
  deliberate, reviewed change.
- `.code-polishy.json` owns this project's modules, dependency direction,
  capabilities, project-specific commands, test suites, artifact targets, and
  temporary exceptions. Shared conditional modules detect supported language,
  framework, and dependency evidence automatically. Target configuration cannot
  weaken the locked shared baseline.
- When responding to the user, be succinct and talk to them like they are a
  CEO with severe ADHD: lead with the outcome, use plain language,
  and keep explanations short and easy to scan.

## Implementation principles

- Never add backward compatibility, legacy support, migrations, or transitional
  code unless the user explicitly asks for it.
- An atomic public cutover is an externally visible contract, not a one-turn or
  one-commit constraint. Use coherent private implementation batches when
  helpful, but never commit a legacy compatibility surface or a partially
  cut-over public API.
- Always prefer the simplest principled solution that fully addresses the root
  cause and remains maintainable long term. Never use speculative abstractions,
  over-engineered designs, or workaround patches that leave the underlying
  problem intact.

## Architecture and state

- Keep one authoritative owner for each concept and generate cross-language or
  downstream contract surfaces from it. Parse external data once at a boundary
  and expose validated internal types.
- Keep delivery and external adapters thin. Domain modules must not import UI,
  HTTP, persistence, provider, or process details unless the checked-in
  architecture contract explicitly allows it.
- Declare separately owned repositories, directories, files, and services as
  external inputs. Make resolution precedence and the resolved source visible;
  validate compatibility, and never turn an unavailable integration into a
  plausible empty result.
- Validate an entire multi-resource mutation before writing and use one atomic
  or transactional boundary. Prefer explicit typed failures over silent
  fallbacks, broad catches, fake success, or keyword heuristics.

## Dependencies and exceptions

- Pin direct dependencies and the package manager exactly. Use frozen lockfiles
  for normal setup; refresh them only during intentional dependency updates.
- Before installing a dependency change, generate its candidate lockfile
  without lifecycle scripts and run
  `code-polishy dependency-review --base <merge-target>`. Review direct and
  transitive changes, release age, native audit, and OSV findings. Never keep a
  known-vulnerable release merely because it is older.
- Release-age assessments, vulnerability assessments, dependency-override
  governance, and general policy exceptions are distinct. Each must be exact,
  visible, owned, justified, and expiring. Vulnerability assessments require
  separate owner and approver identities plus linked analysis, approval, and
  remediation records; low severity by itself is not a justification. Protect
  `.code-polishy.json` with required owner review. Do not add broad or silent
  ignores.

## Test evidence

- Every module has a quick focused boundary suite. Recommended adds applicable
  quick and standard cross-module suites; full covers the complete declared
  product surface. Tests assert observable behavior and use temporary state.
- Never write tautological tests that reproduce implementation logic instead of
  verifying observable behavior.
- Mutation and acceptance-mutation suites are optional supplemental hardening.
  In a managed plan lifecycle, policy-declared local supplemental suites run
  automatically after the ordinary final stage; credentialed, destructive, or
  live-provider probes remain genuine external approval gates. Checked-in
  Gherkin must be executable. Do not use no-op, pass-with-no-tests, or
  coverage-only tests as proof.

## Reviews and isolated workflows

- When an agent review is requested or required, bind it to an explicit trusted
  base and exact candidate. Outside a clean-commit workflow, cover committed,
  staged, unstaged, and untracked changes so the review cannot miss worktree
  state.
- Keep structured agent review evidence in managed artifacts. In a user-facing
  result, report actionable findings and a concise no-findings outcome; do not
  render empty sections or machine sentinels. Distinguish repository-contract
  concerns from requested-outcome concerns when both are present, and tie each
  concern to its source instruction or objective and affected file or hunk.
  Omit automated-check duplicates. Agent review remains non-deterministic
  evidence and cannot replace policy checks or human approval.
- Use `code-polishy task-session` for unattended work or when the caller
  explicitly requests an isolated bounded session. Ordinary interactive work
  may use the caller's current checkout. When a task session is used, select
  named modules before the worker starts, reuse its one worktree for setup and
  tests, never widen its candidate boundary, and never nest a session when
  `CODE_POLISHY_TASK_SESSION=1` is present.
- Use the managed plan loop only for a mature unattended plan. Within it, Agent
  1 may coordinate bounded runner-native delegates that inherit the frozen
  task-session boundary, but Agent 1 owns integration, coherent commits, and
  quiescence. Agent 2 remains a fresh, nondelegating read-only reviewer; its
  independent review cannot be replaced by Agent 1 delegates.

## Verification and delivery

- Local commits are allowed during implementation. Use them when they make work
  easier to review or roll back, keep each batch coherent and independently
  reviewable, and keep review boundaries clean. Never push, publish, or open a
  pull request unless the caller explicitly asks.
- Run exact suite or module tests as useful during implementation. Use
  `code-polishy test --changed` for broader feedback while work is still
  changing. At a genuine merge checkpoint, run `merge-gate` once for the final
  candidate instead of immediately running both commands for unchanged code.
- Before an actual merge checkpoint, resolve the trusted merge target from an
  explicit target, checked-in guidance, `origin/HEAD`, then `origin/main` or
  `origin/master`.
  Run `code-polishy merge-gate --base <merge-target>` without asking the user to
  choose recommended or full. This is the sole autonomous ordinary merge
  authority: it selects only between the configured recommended merge profile
  and the complete full gate and accepts no file, module, suite, or quick-mode
  override.
- `code-polishy test-levels --base <merge-target>` remains a safe read-only
  diagnostic; do not turn its policy selection into a user choice. Summarize a
  merge gate with its pass/fail outcome and actionable findings. Detailed
  selection receipts belong in verbose command logs or managed artifacts, not
  repeated in the human handoff.
- In a managed plan lifecycle, the supervisor runs impact-relevant,
  policy-declared local supplemental suites after ordinary final acceptance;
  `test --all`, `verify`, and `gate` deliberately exclude
  `test --supplemental`. Do not turn credentialed, destructive, or
  live-provider work into local supplemental acceptance.
