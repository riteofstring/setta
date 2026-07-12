# Codex Loop Automation

This directory contains long-running Codex automation harnesses for plan execution and authority checks. These scripts are not part of the standard local development workflow.

Use `run-codex-plan-loop.sh` for generic plan-driven fresh-session loops and
`run-codex-loop.sh` for lower-level prompt loops. Both run without
`--dangerously-bypass-approvals-and-sandbox` unless
`--bypass-approvals-and-sandbox` is passed explicitly.

For long plan implementations that need a committed progress artifact, pass
`--tracking-file` with a repository-relative Markdown tracker. The loop reads
that file with the plan and instructs Codex to update it in the same commit as
implementation work that completes, reopens, or materially changes tracked
phase status.

Example:

```sh
./scripts/automation/codex-loop/run-codex-plan-loop.sh \
  --plan docs/plans/byo-cloud-one-click-runtime-plan.md \
  --tracking-file docs/plans/byo-cloud-one-click-runtime-progress.md \
  --sentinel 'CODEX_LOOP_STOP: BYO_CLOUD_ONE_CLICK_RUNTIME_COMPLETE' \
  --name byo-cloud-one-click-runtime
```

Use `run-review-workflow-meta-plan-loop.sh` for the dedicated review findings
and workflow trajectory meta-plan loop. It follows the older two-agent
step/audit style and intentionally runs in the current repository checkout with
approvals and sandbox bypassed. That behavior is acceptable for this dedicated
automation helper because its purpose is long unattended repo-local execution
where agents are expected to edit and commit directly in the working tree.
