# Plan Loop Automation

This directory contains a long-running Claude Code automation harness for plan
execution. It is not part of the standard local development workflow.

Pass a repository-relative plan document to
`run-plan-implementation-loop.sh`. Implementer agents commit coherent batches
from the current plan phase. They use focused checks while behavior is still
changing and update all assumptions affected by a contract change before
rerunning a long end-to-end scenario.

The implementer and reviewer both run through Claude Code. The reviewer runs
only at a phase boundary. That audit reviews the whole phase and runs its broad
deterministic and live-provider gates once against the stable implementation.
Failed broad gates are narrowed while fixes are in progress, followed by one
final broad rerun. Routine batches do not pay for a second-agent review or
repeat release-level suites. A separate whole-plan audit must still pass before
the loop finishes.

The script intentionally runs in the current clean checkout with Claude Code
permission checks bypassed. Its purpose is unattended repository-local execution
where agents are expected to edit, verify, and commit directly in the working
tree.

```sh
scripts/automation/codex-loop/run-plan-implementation-loop.sh \
  PATH/TO/PLAN.md
```
