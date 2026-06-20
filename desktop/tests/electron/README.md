# Electron Tests

This folder contains production-path Electron workflow tests and their local
helpers.

Run the required Electron workflow manifest after building the desktop app:

```sh
pnpm -C desktop run test:electron:built
```

Inspect or narrow the manifest directly:

```sh
node desktop/tests/electron/run-workflows.mjs --list
node desktop/tests/electron/run-workflows.mjs --workflow workflow-blank-canvas
node desktop/tests/electron/run-workflows.mjs --tier performance
```

Run the workspace graph Phase 3 pan/zoom recorder-on/off matrix directly:

```sh
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario phase3 --skip-build --keep-artifacts --write-report
```

Run the deterministic chat workflows through the root compatibility wrapper:

```sh
./scripts/test_chat_workflows.sh --deterministic-only
```

The wrapper builds the desktop app unless `--skip-build` is provided, delegates
Electron workflow selection to the manifest, and routes live Codex workflows
based on the local Codex CLI ChatGPT auth state.
