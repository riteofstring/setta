# Docs Overview

## Guides
- `guides/worktree-dev-quickstart.md` – create worktrees and run isolated dev instances with predictable ports.
- `guides/browser-mcp-quickstart.md` – quickstart for Chrome DevTools MCP.
- `guides/dev-vs-built.md` – differences between dev and built runtime setups.
- `guides/column-width.md` – how column sizing works in the UI, including drag behavior, bounds, and persistence.
- `guides/frontend-performance-profiling.md` – workflow for profiling and fixing UI performance issues.
- `guides/setta-listener-examples.md` – example-driven guide to listener callbacks, actions, emits, and router endpoints.
- `guides/setta-listener-hot-reload.md` – how to keep a listener running while editing its callbacks.
- `guides/sharing-mode-vs-ide-mode.md` – how share mode differs from IDE mode, how share sessions work, and deployment examples.
- `guides/share-policy-flags.md` – share policy flag coverage for route families and behavior.
- `guides/setta-cli-commands.md` – summary of all `setta` CLI commands and their options.
- `guides/remote-built-install.md` – upload + install steps for a locally built Setta package on a remote server.
- `guides/remote-ssh-manual.md` – manual SSH tunnel steps for remote Setta without a local install.

## Reference
- `reference/code-temp-file-workflow.md` – how Setta stores code files on disk and makes short-lived copies for autocomplete.
- `reference/ai-follow.md` – how AIFollow tags tool calls and drives viewport + highlights in the UI.
- `reference/emit_to_frontend.md` – how a listener script can push new values or artifacts back into the app.
- `reference/json_source_vs_artifact_autosave.md` – why JSON data waits for autosave but artifacts are written right away.
- `reference/logging-and-error-handling.md` – how backend logs are structured, how errors are handled, and how failures reach the UI.
- `reference/meta-controls.md` – how MetaControl sections store values, emit actions, and map into generated code.
- `reference/mcp-system-overview.md` – explains the FastMCP server, client bridge, tool decorators, chat manager, and frontend chat loop (plus third-party access).
- `reference/listener-flows.md` – updated control flow for meta controls, listeners, LSP sync, and disk writes.
- `reference/setta-realtime-behavior.md` – what happens when listeners get a fresh snapshot or realtime updates.

## Notes
- `notes/setta-assessment.md` – product/market assessment and positioning notes.
