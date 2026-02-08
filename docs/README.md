# Docs Overview

## Guides
- `guides/dev-quickstart.md` – boot a full-stack dev environment.
- `guides/worktree-dev-quickstart.md` – create worktrees and run isolated dev instances with predictable ports.
- `guides/browser-mcp-quickstart.md` – quickstart for Chrome DevTools MCP.
- `guides/remote-ssh-manual.md` – manual SSH tunnel steps for remote Setta without a local install.

## Reference
- `reference/app-spec-patching.md` – how appSpec/appDefinition updates are applied (merge patch vs streaming patch ops).
- `reference/code-temp-file-workflow.md` – how Setta stores code files on disk and makes short-lived copies for autocomplete.
- `reference/ai-follow.md` – how AIFollow tags tool calls and drives viewport + highlights in the UI.
- `reference/agentic-edges.md` – agentic edge data model, routes, and UI behavior.
- `reference/column-width.md` – how column sizing works in the UI, including drag behavior, bounds, and persistence.
- `reference/dev-vs-built.md` – differences between dev and built runtime setups.
- `reference/emit_to_frontend.md` – how a listener script can push new values or artifacts back into the app.
- `reference/frontend-performance-profiling.md` – workflow for profiling and fixing UI performance issues.
- `reference/json_source_vs_artifact_autosave.md` – why JSON data waits for autosave but artifacts are written right away.
- `reference/listener-flows.md` – updated control flow for meta controls, listeners, LSP sync, and disk writes.
- `reference/logging-and-error-handling.md` – how backend logs are structured, how errors are handled, and how failures reach the UI.
- `reference/lsp-diagnostics.md` – how LSP diagnostics are collected, broadcast, and surfaced (generated code + code sections).
- `reference/mcp-system-overview.md` – explains the FastMCP server, client bridge, tool decorators, chat manager, and frontend chat loop (plus third-party access).
- `reference/meta-controls.md` – how MetaControl sections store values, emit actions, and map into generated code.
- `reference/remote-built-install.md` – upload + install steps for a locally built Setta package on a remote server.
- `reference/setta-cli-commands.md` – summary of all `setta` CLI commands and their options.
- `reference/setta-listener-examples.md` – example-driven guide to listener callbacks, actions, emits, and router endpoints.
- `reference/setta-listener-hot-reload.md` – how to keep a listener running while editing its callbacks.
- `reference/setta-realtime-behavior.md` – what happens when listeners get a fresh snapshot or realtime updates.
- `reference/share-policy-flags.md` – deployment policy flag coverage for share/app route families and behavior.
- `reference/sharing-mode-vs-ide-mode.md` – runtime modes (IDE vs share/app deployments), how deployment sessions work, and deployment examples.
- `reference/urls-and-routes.md` – frontend URL paths, routing behavior, and API route separation.
- `reference/view-modes.md` – view mode ordering, layout/viewport storage, and settings defaults.

## Examples
- `examples/listener/app.py` – example deployment listener entrypoint (`listener/app.py`).

## Other Docs
- `reference/agent-cli-integration.md` – CLI integration notes for agent workflows.
- `reference/auth-and-sessions.md` – auth tokens, cookies, share sessions, and refresh behavior.
- `reference/chat-sections.md` – how Chat sections behave in managed vs scriptable mode, plus action events and state.
- `reference/chat-toolkit.md` – listener toolkit for custom LLM providers, streaming deltas, tool calls, and sync helpers.
- `reference/codegen-section-policy-and-metadata.md` – explains the section policy rules and the generated metadata output.
- `reference/codegen-targets.md` – describes `codegenTargets`, supported languages, and behavior when disabled.
- `reference/dnd-kit.md` – how the forked dnd-kit integration powers drag, sort, and reparenting in the UI.
- `reference/draw-image-representation.md` – how Draw and Image sections are represented in realtime and packaged runtime.
- `reference/external-agents.md` – how external agent adapters work and how Codex uses app-server.
- `reference/file-browser-pane.md` – how the Overview Explorer tab browses files, filters, and opens Code sections.
- `reference/json_source_formats.md` – JSON source schema formats and validation.
- `reference/json_source_sections.md` – how JSON source sections load from disk, merge values, and save back to JSON.
- `reference/keyboard-shortcuts.md` – keyboard navigation, selection, and manipulation shortcuts in the UI.
- `reference/name-validation.md` – name validation rules and error messaging.
- `reference/param-sweeps.md` – how to run parameter sweeps via the Python runner API.
- `reference/section-sizing-and-ux.md` – default section sizes, sizing rules, and resize UX.
- `reference/watch-code.md` – watch-mode notes for code sections.

## Notes
- `notes/setta-assessment.md` – product/market assessment and positioning notes.

## Plans
- `plans/agentic-graph-ui-plan.md` – agentic graph UI planning notes.
- `plans/app-mode-remaining-work-plan.md` – remaining app-mode work (integrations, extensibility, outputs, export escape hatches).
- `plans/http-request-sections-plan.md` – planning notes for HTTP request sections.
- `plans/pan-zoom-performance-plan.md` – ideas for pan/zoom performance improvements.
- `plans/plugin-system-plan.md` – planning notes for a Setta plugin system (frontend, backend, content).
- `plans/ralph-mode.md` – planning notes for ralph mode.
