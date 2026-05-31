# Electron Tests

This folder contains production-path Electron workflow tests and their local
helpers.

Run the deterministic chat workflows through the root wrapper:

```sh
./scripts/test_chat_workflows.sh --deterministic-only
```

The wrapper builds the desktop app unless `--skip-build` is provided and routes
live Codex workflows based on the local `.env` state.
