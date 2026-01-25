# External Agents

Setta supports external agent adapters for Claude Code, Codex, and OpenCode.

## Codex

Codex runs via the `codex app-server` CLI subcommand (JSON-RPC over stdio). Setta
manages `CODEX_HOME` so the app-server inherits the same Codex CLI config files
and policies.

Key points:

- Run mode: `app_server`
- Transport: JSON-RPC 2.0 over JSONL stdio (no `jsonrpc` field)
- Threading: `thread/start` or `thread/resume`, then `turn/start`
- Approvals: server-initiated JSON-RPC requests (`item/*/requestApproval`)
