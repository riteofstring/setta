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
node desktop/tests/electron/run-workflows.mjs --workflow topic-conversation-pane-projection
node desktop/tests/electron/run-workflows.mjs --tier performance
```

Run the deterministic topic-conversation workflow through the root script wrapper:

```sh
./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

The wrapper builds the desktop app unless `--skip-build` is provided, delegates
Electron workflow selection to the manifest, and routes live Codex workflows
based on the local Codex CLI ChatGPT auth state.
