# Codex Loop Automation

This directory contains long-running Codex automation harnesses for plan execution and authority checks. These scripts are not part of the standard local development workflow.

Use `run-codex-plan-loop.sh` for plan-driven fresh-session loops and `run-codex-loop.sh` for lower-level prompt loops. Both run without `--dangerously-bypass-approvals-and-sandbox` unless `--bypass-approvals-and-sandbox` is passed explicitly.
