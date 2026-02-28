from collections.abc import AsyncIterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import FastAPI, HTTPException
import pytest
import pytest_asyncio

import setta.llm.api_keys as api_keys_module
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    llm_api_keys_path,
    read_managed_api_keys,
)
from setta.routers.llm import (
    UpdateAPIKeysRequest,
    route_get_llm_api_keys,
    route_set_llm_api_keys,
)
from setta.server_state import SettaFastAPIState
from tests.utils.manager_fixture import _seed_minimal_setta_files
from tests.utils.runtime_context import runtime_context
from tests.utils.setta_paths import temporary_setta_paths


@contextmanager
def _patched_setta_paths(tmpdir: Path):
    root = Path(tmpdir)
    setta_root = root / "setta_files"
    for path in (
        setta_root,
        setta_root / "code",
        setta_root / "artifacts",
        setta_root / "backups",
        setta_root / "runtime" / "sessions",
        setta_root / "runtime" / "logs",
        setta_root / "runtime" / "mcp",
        setta_root / "runtime" / "secrets",
        setta_root / "runtime" / "detached_runs",
        setta_root / "share_deployments",
    ):
        path.mkdir(parents=True, exist_ok=True)
    _seed_minimal_setta_files(setta_root)
    with temporary_setta_paths(
        workspace_root=root,
        setta_files_location="local",
    ):
        yield


async def _build_state() -> SettaFastAPIState:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        enable_mcp_connections=False,
        enable_language_server=False,
    )
    await state.wait_until_ready()
    return state


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.project_manager_switcher:
        for manager in state.project_manager_switcher.project_managers:
            manager.shutdown()
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()
    if state.lsps and state.lsp_readers:
        await stop_lsps(state.lsps, state.lsp_readers)
    if state.lsp_writers:
        stop_file_watcher(state.lsp_writers)


@pytest_asyncio.fixture
async def state_env(tmp_path: Path) -> AsyncIterator[SettaFastAPIState]:
    with _patched_setta_paths(tmp_path):
        state = await _build_state()
        try:
            yield state
        finally:
            await _shutdown_state(state)


@pytest.mark.asyncio
async def test_llm_api_keys_routes_return_unreferenced_keys(
    state_env: SettaFastAPIState,
) -> None:
    # Arbitrary keys should persist and round-trip through the managed key store
    # even when no configured provider references them.
    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"UNSCOPED_CUSTOM_KEY": "custom-secret"},
                expectedRevision=initial_keys.revision,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert response.apiKeys["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    assert response.revision == 1
    assert keys_from_get.apiKeys["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    assert keys_from_get.revision == 1
    assert (
        read_managed_api_keys(state_env.dbe)["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    )

    # Runtime provider execution still uses the filtered key map.
    assert state_env.agent_runner.api_keys == {}


@pytest.mark.asyncio
async def test_llm_api_keys_set_route_broadcasts_snapshot_immediately(
    state_env: SettaFastAPIState,
) -> None:
    # Successful writes should publish revisioned key snapshots without waiting
    # for file-watcher callbacks.
    state_env.wmh_frontend_sender.broadcast_llm_api_keys_update = AsyncMock()

    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "immediate-secret"},
                expectedRevision=initial_keys.revision,
            ),
            runtime_ctx,
        )

    assert state_env.wmh_frontend_sender.broadcast_llm_api_keys_update.await_count >= 1
    payload = (
        state_env.wmh_frontend_sender.broadcast_llm_api_keys_update.await_args_list[
            -1
        ].args[0]
    )
    assert payload.revision == response.revision
    assert payload.apiKeys == {"OPENAI_API_KEY": "immediate-secret"}


@pytest.mark.asyncio
async def test_llm_api_keys_set_route_does_not_reread_store_after_successful_write(
    state_env: SettaFastAPIState,
) -> None:
    # Save-ack convergence must be sourced from the successful CAS write payload.
    state_env.wmh_frontend_sender.broadcast_llm_api_keys_update = AsyncMock()

    def _raise_on_read(_path: Path) -> str | None:
        raise OSError("post-write reread should not execute")

    state_env.dbe.read = _raise_on_read

    with runtime_context(state_env) as runtime_ctx:
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "saved-without-reread"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )

    assert response.apiKeys == {"OPENAI_API_KEY": "saved-without-reread"}
    assert response.revision == 1
    assert state_env.agent_runner.raw_env_vars == {
        "OPENAI_API_KEY": "saved-without-reread"
    }
    state_env.wmh_frontend_sender.broadcast_llm_api_keys_update.assert_called_once()
    payload = state_env.wmh_frontend_sender.broadcast_llm_api_keys_update.await_args.args[
        0
    ]
    assert payload.apiKeys == {"OPENAI_API_KEY": "saved-without-reread"}
    assert payload.revision == 1
    assert payload.corrupt is False


@pytest.mark.asyncio
async def test_llm_api_keys_routes_remove_key_on_empty_value(
    state_env: SettaFastAPIState,
) -> None:
    # Sending an empty value deletes that key from persisted env storage.
    with runtime_context(state_env) as runtime_ctx:
        first_write = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"UNSCOPED_CUSTOM_KEY": "custom-secret"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"UNSCOPED_CUSTOM_KEY": ""},
                expectedRevision=first_write.revision,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert "UNSCOPED_CUSTOM_KEY" not in response.apiKeys
    assert response.revision == 2
    assert "UNSCOPED_CUSTOM_KEY" not in keys_from_get.apiKeys
    assert keys_from_get.revision == 2


@pytest.mark.asyncio
async def test_llm_api_keys_routes_do_not_expose_unrelated_dotenv_entries(
    state_env: SettaFastAPIState,
) -> None:
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "dotenv-openai-secret",
            "UNRELATED_SECRET": "do-not-expose",
        }
    )
    state_env.dbe.reload_dot_env()
    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "managed-secret"},
                expectedRevision=initial_keys.revision,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert keys_from_get.apiKeys == {"OPENAI_API_KEY": "managed-secret"}
    assert "UNRELATED_SECRET" not in keys_from_get.apiKeys
    assert state_env.dbe.read_dot_env()["UNRELATED_SECRET"] == "do-not-expose"


@pytest.mark.asyncio
async def test_read_managed_api_keys_rejects_falsy_non_object_payloads(
    state_env: SettaFastAPIState,
) -> None:
    # Malformed JSON roots must fail loudly instead of being treated as an empty key store.
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    state_env.dbe.write_json(managed_keys_path, [])
    with pytest.raises(ValueError, match="must contain an object"):
        read_managed_api_keys(state_env.dbe)
    state_env.dbe.write_json(managed_keys_path, False)
    with pytest.raises(ValueError, match="must contain an object"):
        read_managed_api_keys(state_env.dbe)


@pytest.mark.asyncio
async def test_llm_api_keys_route_can_repair_corrupt_store_payload(
    state_env: SettaFastAPIState,
) -> None:
    state_env.dbe.write_json(llm_api_keys_path(state_env.dbe), [])

    with runtime_context(state_env) as runtime_ctx:
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={
                    " OPENAI_API_KEY ": "  repaired-secret  ",
                    "EMPTY_KEY": "   ",
                },
                expectedRevision=0,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert response.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert response.revision == 1
    assert keys_from_get.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert keys_from_get.revision == 1
    assert read_managed_api_keys(state_env.dbe) == {"OPENAI_API_KEY": "repaired-secret"}


@pytest.mark.asyncio
async def test_llm_api_keys_route_can_repair_malformed_json_store_payload(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    # Syntactically-invalid managed key files should still be recoverable by saving.
    managed_keys_path.write_text('{"OPENAI_API_KEY":"broken"', encoding="utf-8")

    with runtime_context(state_env) as runtime_ctx:
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "repaired-secret"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert response.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert response.revision == 1
    assert keys_from_get.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert keys_from_get.revision == 1
    assert read_managed_api_keys(state_env.dbe) == {"OPENAI_API_KEY": "repaired-secret"}


@pytest.mark.asyncio
async def test_llm_api_keys_route_can_repair_invalid_utf8_store_payload(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    managed_keys_path.write_bytes(b"\xff\xfe\xfd")

    with runtime_context(state_env) as runtime_ctx:
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "repaired-secret"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert response.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert response.revision == 1
    assert keys_from_get.apiKeys == {"OPENAI_API_KEY": "repaired-secret"}
    assert keys_from_get.revision == 1
    assert read_managed_api_keys(state_env.dbe) == {"OPENAI_API_KEY": "repaired-secret"}


@pytest.mark.asyncio
async def test_llm_api_keys_route_rejects_stale_revision_with_409(
    state_env: SettaFastAPIState,
) -> None:
    with runtime_context(state_env) as runtime_ctx:
        first_write = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "initial-secret"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )
        with pytest.raises(HTTPException) as exc_info:
            await route_set_llm_api_keys(
                UpdateAPIKeysRequest(
                    apiKeys={
                        "OPENAI_API_KEY": "initial-secret",
                        "ANTHROPIC_API_KEY": "stale-write",
                    },
                    expectedRevision=0,
                ),
                runtime_ctx,
            )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert first_write.revision == 1
    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected revision-conflict detail payload.")
    assert (
        exc_info.value.detail.get("errorCode")
        == MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
    )
    assert exc_info.value.detail.get("revision") == 1
    assert keys_from_get.apiKeys == {"OPENAI_API_KEY": "initial-secret"}
    assert keys_from_get.revision == 1


@pytest.mark.asyncio
async def test_llm_api_keys_get_route_returns_typed_corruption_error(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    managed_keys_path.write_text('{"OPENAI_API_KEY":"broken"', encoding="utf-8")

    with runtime_context(state_env) as runtime_ctx:
        with pytest.raises(HTTPException) as exc_info:
            await route_get_llm_api_keys(runtime_ctx)

    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected typed corruption detail payload.")
    assert exc_info.value.detail.get("errorCode") == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
    assert exc_info.value.detail.get("revision") == 0


@pytest.mark.asyncio
async def test_llm_api_keys_get_route_returns_typed_corruption_error_for_invalid_utf8(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    managed_keys_path.write_bytes(b"\xff\xfe")

    with runtime_context(state_env) as runtime_ctx:
        with pytest.raises(HTTPException) as exc_info:
            await route_get_llm_api_keys(runtime_ctx)

    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected typed corruption detail payload.")
    assert exc_info.value.detail.get("errorCode") == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
    assert exc_info.value.detail.get("revision") == 0


@pytest.mark.asyncio
async def test_llm_api_keys_get_route_returns_unavailable_error_for_io_failures(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    managed_keys_path.mkdir()

    with runtime_context(state_env) as runtime_ctx:
        with pytest.raises(HTTPException) as exc_info:
            await route_get_llm_api_keys(runtime_ctx)

    assert exc_info.value.status_code == 503
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected typed unavailable detail payload.")
    assert (
        exc_info.value.detail.get("errorCode")
        == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
    )
    assert exc_info.value.detail.get("revision") == 0


@pytest.mark.asyncio
async def test_llm_api_keys_set_route_returns_unavailable_error_for_io_failures(
    state_env: SettaFastAPIState,
) -> None:
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    managed_keys_path.mkdir()

    with runtime_context(state_env) as runtime_ctx:
        with pytest.raises(HTTPException) as exc_info:
            await route_set_llm_api_keys(
                UpdateAPIKeysRequest(
                    apiKeys={"OPENAI_API_KEY": "secret"},
                    expectedRevision=0,
                ),
                runtime_ctx,
            )

    assert exc_info.value.status_code == 503
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected typed unavailable detail payload.")
    assert (
        exc_info.value.detail.get("errorCode")
        == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
    )
    assert exc_info.value.detail.get("revision") == 0


@pytest.mark.asyncio
async def test_llm_api_keys_set_route_returns_typed_unavailable_error_when_write_fails(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)

        # Write-path failures should map to the same typed unavailable route payload.
        def _raise_write_failure(*args, **kwargs) -> None:
            raise OSError("disk full")

        monkeypatch.setattr(
            api_keys_module,
            "_write_managed_api_keys_store_payload",
            _raise_write_failure,
        )

        with pytest.raises(HTTPException) as exc_info:
            await route_set_llm_api_keys(
                UpdateAPIKeysRequest(
                    apiKeys={"OPENAI_API_KEY": "secret"},
                    expectedRevision=initial_keys.revision,
                ),
                runtime_ctx,
            )

    assert exc_info.value.status_code == 503
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected typed unavailable detail payload.")
    assert (
        exc_info.value.detail.get("errorCode")
        == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
    )
    assert exc_info.value.detail.get("revision") == 0


@pytest.mark.asyncio
async def test_llm_api_key_watcher_uses_managed_store_not_dotenv(
    state_env: SettaFastAPIState,
) -> None:
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "dotenv-openai-secret",
            "UNRELATED_SECRET": "do-not-expose",
        }
    )
    state_env.dbe.reload_dot_env()
    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "managed-secret"},
                expectedRevision=initial_keys.revision,
            ),
            runtime_ctx,
        )

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.raw_env_vars == {"OPENAI_API_KEY": "managed-secret"}
    assert "UNRELATED_SECRET" not in state_env.agent_runner.raw_env_vars


@pytest.mark.asyncio
async def test_llm_api_key_watcher_clears_runtime_keys_when_managed_store_is_invalid(
    state_env: SettaFastAPIState,
) -> None:
    # Invalid managed payloads should fail closed so stale runtime keys are removed.
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    state_env.dbe.write_json(llm_api_keys_path(state_env.dbe), [])

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.raw_env_vars == {}


@pytest.mark.asyncio
async def test_llm_api_key_watcher_clears_runtime_keys_when_managed_store_is_malformed_json(
    state_env: SettaFastAPIState,
) -> None:
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    # Malformed JSON should clear runtime API keys and surface corruption details.
    managed_keys_path.write_text('{"OPENAI_API_KEY":"broken"', encoding="utf-8")

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.raw_env_vars == {}


@pytest.mark.asyncio
async def test_llm_config_watcher_does_not_fail_when_managed_store_is_invalid(
    state_env: SettaFastAPIState,
) -> None:
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    state_env.dbe.write_json(llm_api_keys_path(state_env.dbe), [])

    await state_env.llm_config_watcher._reload_config()

    assert state_env.agent_runner.raw_env_vars == {}


@pytest.mark.asyncio
async def test_llm_config_watcher_does_not_fail_when_managed_store_is_malformed_json(
    state_env: SettaFastAPIState,
) -> None:
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    managed_keys_path = llm_api_keys_path(state_env.dbe)
    managed_keys_path.parent.mkdir(parents=True, exist_ok=True)
    # Config reload should not throw when managed API keys are malformed text.
    managed_keys_path.write_text('{"OPENAI_API_KEY":"broken"', encoding="utf-8")

    await state_env.llm_config_watcher._reload_config()

    assert state_env.agent_runner.raw_env_vars == {}
