# Codex Loop Automation

This directory contains long-running Codex automation harnesses for plan execution and authority checks. These scripts are not part of the standard local development workflow.

Use `run-codex-plan-loop.sh` for generic plan-driven fresh-session loops and
`run-codex-loop.sh` for lower-level prompt loops. Both run without
`--dangerously-bypass-approvals-and-sandbox` unless
`--bypass-approvals-and-sandbox` is passed explicitly.

Use `run-topic-conversations-plan-loop.sh` for the dedicated
`topic-conversations-global-master-narrator-20260711.md` implementation loop.
It runs a fresh implementer followed by a fresh reviewer for every slice,
requires a clean in-place worktree, verifies the full Codex source checkout,
and treats external blockage as a non-success result distinct from full plan
completion. It intentionally bypasses approvals and sandboxing because its
agents implement, verify, update the plan, and commit directly in the current
checkout.

Use `run-review-workflow-meta-plan-loop.sh` for the dedicated review findings
and workflow trajectory meta-plan loop. It follows the older two-agent
step/audit style and intentionally runs in the current repository checkout with
approvals and sandbox bypassed. That behavior is acceptable for this dedicated
automation helper because its purpose is long unattended repo-local execution
where agents are expected to edit and commit directly in the working tree.
