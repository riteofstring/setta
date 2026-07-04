# Codex Loop Automation

This directory contains long-running Codex automation harnesses for plan execution and authority checks. These scripts are not part of the standard local development workflow.

Use `run-codex-plan-loop.sh` for generic plan-driven fresh-session loops and
`run-codex-loop.sh` for lower-level prompt loops. Both run without
`--dangerously-bypass-approvals-and-sandbox` unless
`--bypass-approvals-and-sandbox` is passed explicitly.

Use `run-chat-run-liveness-navigation-steps-loop.sh` for the dedicated chat run
liveness navigation plan loop. It follows the older two-agent step/audit style
and runs with approvals and sandbox bypassed, because it is intended for long
unattended repo-local execution.
