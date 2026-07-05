# Codex Loop Automation

This directory contains long-running Codex automation harnesses for plan execution and authority checks. These scripts are not part of the standard local development workflow.

Use `run-codex-plan-loop.sh` for generic plan-driven fresh-session loops and
`run-codex-loop.sh` for lower-level prompt loops. Both run without
`--dangerously-bypass-approvals-and-sandbox` unless
`--bypass-approvals-and-sandbox` is passed explicitly.

Use `run-skills-cli-workflow-authoring-plan-loop.sh` for the dedicated Skills +
CLI workflow authoring plan loop. It follows the older two-agent step/audit
style and intentionally runs in the current repository checkout with approvals
and sandbox bypassed. That behavior is acceptable for this dedicated automation
helper because its purpose is long unattended repo-local execution where agents
are expected to edit and commit directly in the working tree.
