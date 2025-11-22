# Portkey config + validation workflow

- **Edit config in one place:** Use the LLM settings panel (or `setta_files/llm_config.json`) to add providers via presets, set `gateway_url`, and pick project-scoped defaults. Saved configs are reloaded live by the backend and pushed to the UI.
- **Validate before saving:** Run the “Test config” action in the settings panel (or call `TEST_LLM_CONFIG`) to hit the Portkey gateway health check and each provider’s `models.list()` with the supplied API keys/headers. Inline notifications now surface failures immediately.
- **End-to-end manual check:** 
  1) `source activate.sh && pnpm start` (with `SETTA_DEV_MODE=true` to auto-start the bundled gateway)  
  2) Pick a provider/model in the chat header; the send button stays disabled until a valid selection exists.  
  3) Send a prompt and confirm streamed text/tool-call deltas arrive; stop generation via the stop button and verify the stream status persists on reload.
- **Troubleshooting:** Backend logs now emit structured entries for each chat stream (chat id, project config, provider/model). Gateway/provider failures also trigger frontend error notifications with the same context so credential/base URL issues are visible without tailing logs.
