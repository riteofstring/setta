# Testing Refactor Plan: Use Real Objects in Unit Tests

## Overview

We want Python unit tests that currently rely on hand-rolled “fake” objects to exercise real runtime collaborators instead. This improves fidelity, keeps tests aligned with production code, and makes scenarios easier to reason about even if they take a bit longer to execute. Going forward, do not introduce or retain stub, fake, synthetic, or mock implementations in these flows.

## Action Items

1. **Introduce a shared async fixture** — ✅ completed in `tests/utils/manager_fixture.py`
   - Spin up a real `SettingsProjectManager` wired together with real collaborators (`DBE`, `SettingsFile`, `Artifacts`, `JSONSource`, `WMHFrontendSender`) inside a `TemporaryDirectory`.
   - Start the language server within the fixture so the manager exercises the real writers, even if suite runtime increases a bit.
   - Patch `setta.utils.constants.C.CODE_FOLDER` to the temporary path.
   - Clean up by cancelling `queue_task` and stopping any observers/watchers to prevent stray background tasks between tests.

2. **Refactor queue & concurrency tests** — ✅ replaced stubs with the real manager in `tests/project_state/test_completion_queue_concurrency.py`
   - Update `tests/project_state/test_completion_queue_concurrency.py` to use the shared fixture instead of `QueueIntegrationManager` and `MinimalBaseProjectManager`.
   - Attach the existing helper coroutines to the real manager via `BaseProjectManager.enqueue_method`.
   - Remove `StubGenCode` entirely so the tests drive the real generator path; populate `manager.gen_code` using the concrete implementation exercised by the fixture and assert against the live manager state (`pending_frontend_ops`, `_current_frontend_op_id`).

3. **Update enqueue decorator tests**
   - Replace the `DummyManager` in `tests/project_state/test_enqueue_method.py` with the shared fixture.
   - Dynamically bind the test helper methods onto the real manager and assert the same concurrency and bookkeeping properties (`_finalized`, pending IDs, etc.).

4. **Exercise manual save behaviour end-to-end**
   - In `tests/project_state/test_manual_save_autosave.py`, swap out the manual object construction with the shared fixture.
   - Shorten the debouncer wait to keep the test fast, schedule an autosave, call `perform_manual_save()`, and assert `is_pending` is cleared.
   - Verify that `setta-settings-project.json` in the temporary DB directory changes on disk rather than stubbing `save()` / `autosave()`.

5. **Rework JSON source debounce coverage**
   - Update `tests/project_state/jsonSource/test_json_source_reload_debounce.py` to pull actual `(sectionId, variantId, Path)` tuples from the manager’s JSON-source mapping.
   - Drive `autosave_debouncer.trigger()` to toggle pending state instead of manually wiring flags.
   - For `_flush_deferred_json_source_loads`, pre-populate deferred variants, optionally wrap `load_json_sources` to capture arguments, let the real implementation run, and assert the cached data updates while the deferred set is cleared.

## Additional Considerations

- Place the shared fixture in a new helper module (e.g., `tests/utils/manager_fixture.py`) and expose async context managers so every test gets a fresh temp workspace and deterministic cleanup.
- Consider extending `SpecificFileWatcher` with a test mode that skips starting the watchdog thread to avoid noisy output; if we need that, include the production tweak in the same refactor.
- Expect marginally slower suites due to the higher-fidelity setup; if runtime becomes an issue, explore test-level parallelism or selective markers for longer flows.
- Starting the language server in tests is acceptable; prioritize fidelity over synthetic stubs like `TestLSPWriters`.
- Delete `StubGenCode` and any similar scaffolding; keep test collaborators real so behaviour matches production.
