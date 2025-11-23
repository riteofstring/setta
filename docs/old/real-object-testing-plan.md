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

3. **Update enqueue decorator tests** — ✅ replaced `DummyManager` with the real `SettingsProjectManager` fixture in `tests/project_state/test_enqueue_method.py`
   - Bind helper coroutines onto the live manager via `BaseProjectManager.enqueue_method` so serialized calls go through the actual queue.
   - Assert sequential execution, concurrent non-serialized behaviour, and real bookkeeping (`pending_frontend_ops`, `completed_op_ids_since_last_broadcast`, `_current_frontend_op_id`).

4. **Exercise manual save behaviour end-to-end** — ✅ `tests/project_state/test_manual_save_autosave.py` now uses the shared fixture
   - Bound the test to the real `SettingsProjectManager`, shortened the debounce wait, and asserted on the live debouncer plus filesystem timestamps.
   - Added fixture teardown that closes LSP stdin/stdout and waits for the subprocess so the asyncio loop shuts down without resource warnings.
   - Some macOS environments may emit watchdog’s “Cannot start fsevents stream” warning during teardown; it’s harmless and can be ignored.

5. **Rework JSON source debounce coverage** — ✅ `tests/project_state/jsonSource/test_json_source_reload_debounce.py` now exercises the real manager
   - Tests pull actual `(sectionId, variantId, Path)` tuples from the fixture, drive `autosave_debouncer.trigger()` to toggle pending state, and assert against the real defer logic.
   - `_flush_deferred_json_source_loads` uses a spy around `load_json_sources` to confirm the cache updates and deferred set clears.

## Additional Considerations

- Place the shared fixture in a new helper module (e.g., `tests/utils/manager_fixture.py`) and expose async context managers so every test gets a fresh temp workspace and deterministic cleanup.
- The macOS fsevents warning (“Cannot start fsevents stream…”) is harmless—leave the real `SpecificFileWatcher` in place and ignore the warning if it appears.
- Expect marginally slower suites due to the higher-fidelity setup; if runtime becomes an issue, explore test-level parallelism or selective markers for longer flows.
- Starting the language server in tests is acceptable; prioritize fidelity over synthetic stubs like `TestLSPWriters`.
- Delete `StubGenCode` and any similar scaffolding; keep test collaborators real so behaviour matches production.
