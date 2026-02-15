# Built-mode default AI config seeding plan

## Goal
- Make first-run built installs usable without manual JSON setup.
- Ensure the engine dropdown is populated in built mode the same way dev mode is today.

## Problem summary
- Dev mode seeds agentic config files (`engine_configs.json`, `external_agents.json`, `agent_profiles.json`) on startup.
- Built mode currently does not seed those files, so `/getEngineConfigs` returns an empty list and the engine dropdown is empty.
- LLM config hydration from `llm_config.example.json` is also gated to dev mode, so built mode can start with no provider configs.

## Desired behavior
- In IDE mode (non-share/app), both dev and built should seed baseline AI config files on first run.
- Existing user files must never be overwritten.
- Built users should immediately see default engines and only need to add API keys.

## Implementation plan
1. Seed agentic defaults in built mode too.
   - Update `backend/setta/server_state.py` to call `seed_agentic_config_files(self.dbe)` unconditionally for non-deployment mode.
   - Keep share/app behavior unchanged.
2. Load `llm_config.example.json` when persisted LLM config is empty, regardless of dev mode.
   - Update `backend/setta/llm/config.py` so example fallback is not guarded by `IS_DEV_MODE`.
   - Preserve current legacy-empty check (`{"configs": {}, "default_config_id": None}`).
3. Keep non-destructive behavior.
   - Rely on existing seed helpers that only write when target files are missing.
   - Do not replace user-authored configs.

## Verification
- Add/update tests:
  - `tests/llm/test_config.py`
    - verify example fallback works when `IS_DEV_MODE` is not set.
  - `tests/agentic/test_example_config.py` (new)
    - verify agentic seed helper creates defaults when files are absent.
    - verify existing files are preserved.
- Run focused tests:
  - `source activate.sh && ./scripts/run_backend_tests.sh tests/llm/test_config.py tests/agentic/test_example_config.py`

## Risks and mitigations
- Risk: accidental overwrite of user config.
  - Mitigation: seeding functions are existence-gated; tests assert preservation.
- Risk: changing startup behavior in non-dev mode.
  - Mitigation: scope remains IDE mode only; share/app paths unchanged.

