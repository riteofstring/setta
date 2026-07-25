# Codex Loop Automation

This directory contains a long-running Codex automation harness for plan
execution. It is not part of the standard local development workflow.

Pass a repository-relative plan document to
`run-plan-implementation-loop.sh`. The script uses two fresh agents per
iteration: one implements and commits the next plan step, and the other reviews
and fixes that work. A separate whole-plan audit must pass before the loop
finishes.

The script intentionally runs in the current clean checkout with approvals and
sandbox bypassed. Its purpose is unattended repository-local execution where
agents are expected to edit, verify, and commit directly in the working tree.

```sh
scripts/automation/codex-loop/run-plan-implementation-loop.sh \
  PATH/TO/PLAN.md
```
