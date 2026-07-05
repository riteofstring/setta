# Bundled Setta CLI For Workflow Agents

## Problem

Workflow-owned Codex runs are instructed to report node results with:

```bash
setta workflow executions result --app-data-dir <appDataDir> --input <path>
```

That is the right canonical contract, but production desktop currently does not guarantee that a
`setta` executable is available on the Codex app-server `PATH`. Tests can mask this by installing a
temporary `setta` shim. In packaged or normal desktop runs, an agent can complete the task but fail
result reporting, causing the workflow node to fail.

## Goal

Make the `setta workflow` CLI a product-provided execution surface for in-app agents, using the same
CLI/API contract external agents use.

## Non-Goals

- Do not reintroduce Codex app-server dynamic tools.
- Do not add MCP.
- Do not add a second in-app-only result-reporting path.
- Do not rely on a separately installed user `setta` binary for desktop workflow execution.

## Plan

1. Build `cmd/setta` as a desktop companion binary alongside `cmd/setta-backend`.
2. Package the CLI in the desktop app/runtime artifact with stable executable permissions.
3. Resolve the bundled CLI directory at backend startup.
4. Prepend that directory to the Codex app-server environment before launch.
5. Keep workflow prompts using the command name `setta`, so in-app and external agents use the same contract.
6. Replace test-only `setta` PATH shims with assertions that the product-provided CLI is available.
7. Add a startup or workflow-run preflight that fails loudly if the bundled CLI is missing or not executable.

## Verification

- Production desktop build contains both `setta-backend` and `setta`.
- In-app Codex app-server environment resolves `setta` to the bundled CLI.
- Workflow-owned Codex node can report results through `setta workflow executions result`.
- Existing deterministic Electron workflow tests pass without test-specific `setta` shims.
- Live Codex Electron workflow passes when ChatGPT auth is available.
