---
name: setta-cli
description: Operate Setta safely through the self-describing `setta` CLI. Use when Codex needs to inspect Setta commands, connect to a Setta backend, open workspaces, create conversations, send or watch chat runs, handle approvals, manage Codex account state, or use low-level Setta HTTP API operations from a shell.
---

# Setta CLI

Use the `setta` CLI as the durable Setta automation surface. Do not rely on internal app APIs when a workflow command exists.

## Procedure

1. Run `setta version --json`.
2. Run `setta commands --json`.
3. Before unfamiliar commands, run `setta help <command-path> --json`.
4. Prefer `--json` for one-shot commands and `--ndjson` for streaming commands.
5. Use `--no-input` for automation.
6. Use explicit workspace, conversation, run, and approval IDs returned by JSON output.
7. Use `--confirm` only when the user requested the destructive operation.
8. Use `setta api ...` only when no workflow command covers the task.

## References

- For starting or targeting a backend, read `references/backend-connection.md`.
- For workspace and conversation setup, read `references/workspaces-and-conversations.md`.
- For chat sends, run watching, queueing, steering, and approvals, read `references/chat-runs-and-approvals.md`.
- For Codex account commands, read `references/codex-account.md`.
- For low-level endpoint calls, read `references/low-level-api.md`.
- For the generated command list, read `references/command-index.md` or regenerate it with `setta agent skill export --output DIR`.
