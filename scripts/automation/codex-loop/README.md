# Plan Loop Automation

This directory contains a long-running Claude Code/Codex automation harness for
plan execution. It is not part of the standard local development workflow.

Pass a repository-relative, repository-contained regular plan document to
`run-plan-implementation-loop.sh`; symlink and traversal escapes fail before an agent starts.
Transcript output must resolve outside the repository. Implementer agents commit coherent batches
from the current plan phase. They use focused checks while behavior is still
changing and update all assumptions affected by a contract change before
rerunning a long end-to-end scenario.

The implementer and reviewer can each run through Codex or Claude Code. The
reviewer runs only at a phase boundary. Routine batches do not pay for a
second-agent review, and a separate whole-plan audit must still pass before the
loop finishes.

Verification authorization is explicit per invocation. The default `none`
permits static inspection and formatting but no automated checks or live
execution. Use `plan-probes` only when the user has authorized the bounded,
non-destructive probes named by the plan. Use `tests` only when the user has
explicitly requested automated verification; repository policy and phase
readiness still apply.

The script intentionally runs in the current clean checkout with Claude Code and
Codex permission checks bypassed. Its purpose is unattended repository-local
execution where agents are expected to edit, verify, and commit directly in the
working tree.

The Codex reference-source checkout is optional. Pass
`--codex-reference-repo PATH` only when the plan needs protocol or source
inspection against a local Codex checkout.

```sh
scripts/automation/codex-loop/run-plan-implementation-loop.sh \
  PATH/TO/PLAN.md \
  --verification-authorization plan-probes
```
