from collections.abc import AsyncIterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import FastAPI, HTTPException
import pytest
import pytest_asyncio

import setta.llm.api_keys as api_keys_module
import setta.routers.llm as llm_router_module
from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    ManagedAPIKeysStoreUnavailableError,
    llm_api_keys_path,
    read_managed_api_keys,
)
from setta.routers.llm import (
    UpdateAPIKeysRequest,
    route_get_llm_api_keys,
    route_set_llm_api_keys,
)
from setta.server_state import SettaFastAPIState
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from tests.utils.manager_fixture import _seed_minimal_setta_files
from tests.utils.runtime_context import runtime_context
from tests.utils.setta_paths import temporary_setta_paths

_MANAGED_KEY_NAMES_ENV_VAR = "SETTA_MANAGED_LLM_API_KEY_NAMES"


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


def _set_single_provider_config(
    state_env: SettaFastAPIState,
    *,
    config_id: str,
    provider: str,
    api_key_env: str,
) -> None:
    state_env.agent_runner.update_config(
        AllLLMConfigs(
            configs={
                config_id: LLMConfig(
                    id=config_id,
                    model="test-model",
                    provider=provider,
                    api_key_env=api_key_env,
                )
            },
            default_config_id=config_id,
        )
    )


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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_single_provider_config(
        state_env,
        config_id="anthropic-default",
        provider="anthropic",
        api_key_env="ANTHROPIC_API_KEY",
    )
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

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
    assert response.revision > 0
    assert keys_from_get.apiKeys["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    assert keys_from_get.revision == response.revision
    assert (
        read_managed_api_keys(state_env.dbe)["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    )
    assert state_env.agent_runner.api_keys == {}


@pytest.mark.asyncio
async def test_llm_api_keys_set_route_broadcasts_snapshot_immediately(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_single_provider_config(
        state_env,
        config_id="openai-default",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_env.wmh_frontend_sender.broadcast_llm_api_keys_update = AsyncMock()

    def _raise_unexpected_read(*_args, **_kwargs):
        raise AssertionError("route_set_llm_api_keys should not re-read key store")

    monkeypatch.setattr(
        llm_router_module,
        "read_managed_api_keys_with_status",
        _raise_unexpected_read,
    )

    with runtime_context(state_env) as runtime_ctx:
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "saved-without-reread"},
                expectedRevision=0,
            ),
            runtime_ctx,
        )

    assert response.apiKeys == {"OPENAI_API_KEY": "saved-without-reread"}
    assert response.revision > 0
    state_env.wmh_frontend_sender.broadcast_llm_api_keys_update.assert_called_once()


@pytest.mark.asyncio
async def test_llm_api_keys_routes_remove_key_on_empty_value(
    state_env: SettaFastAPIState,
) -> None:
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
    assert response.revision == 0
    assert "UNSCOPED_CUSTOM_KEY" not in keys_from_get.apiKeys
    assert keys_from_get.revision == 0
    assert read_managed_api_keys(state_env.dbe) == {}


@pytest.mark.asyncio
async def test_llm_api_keys_routes_do_not_expose_unrelated_dotenv_entries(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_single_provider_config(
        state_env,
        config_id="openai-default",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
async def test_llm_api_keys_routes_include_configured_dotenv_keys(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_single_provider_config(
        state_env,
        config_id="anthropic-default",
        provider="anthropic",
        api_key_env="ANTHROPIC_API_KEY",
    )
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    state_env.dbe.write_dot_env(
        {
            "ANTHROPIC_API_KEY": "dotenv-anthropic-secret",
            "UNRELATED_SECRET": "do-not-expose",
        }
    )
    state_env.dbe.reload_dot_env()
    with runtime_context(state_env) as runtime_ctx:
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert keys_from_get.apiKeys["ANTHROPIC_API_KEY"] == "dotenv-anthropic-secret"
    assert "UNRELATED_SECRET" not in keys_from_get.apiKeys
    assert read_managed_api_keys(state_env.dbe) == {}


@pytest.mark.asyncio
async def test_llm_api_keys_route_can_repair_corrupt_index_payload(
    state_env: SettaFastAPIState,
) -> None:
    state_env.dbe.write_dot_env(
        {
            "UNRELATED_SECRET": "keep-me",
            _MANAGED_KEY_NAMES_ENV_VAR: "not-json",
        }
    )

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

    assert response.apiKeys["OPENAI_API_KEY"] == "repaired-secret"
    assert response.revision > 0
    assert keys_from_get.apiKeys["OPENAI_API_KEY"] == "repaired-secret"
    assert keys_from_get.revision == response.revision
    assert read_managed_api_keys(state_env.dbe) == {"OPENAI_API_KEY": "repaired-secret"}
    assert state_env.dbe.read_dot_env()["UNRELATED_SECRET"] == "keep-me"


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

    assert exc_info.value.status_code == 409
    assert isinstance(exc_info.value.detail, dict)
    if not isinstance(exc_info.value.detail, dict):
        raise AssertionError("Expected revision-conflict detail payload.")
    assert (
        exc_info.value.detail.get("errorCode")
        == MANAGED_API_KEYS_REVISION_CONFLICT_ERROR_CODE
    )
    assert exc_info.value.detail.get("revision") == first_write.revision
    assert keys_from_get.apiKeys["OPENAI_API_KEY"] == "initial-secret"
    assert keys_from_get.revision == first_write.revision


@pytest.mark.asyncio
async def test_llm_api_keys_get_route_returns_typed_corruption_error(
    state_env: SettaFastAPIState,
) -> None:
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "broken",
            _MANAGED_KEY_NAMES_ENV_VAR: "not-json",
        }
    )

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

        def _raise_write_failure(*_args, **_kwargs) -> None:
            raise ManagedAPIKeysStoreUnavailableError("disk full")

        monkeypatch.setattr(
            api_keys_module,
            "_write_dot_env_payload_to_disk",
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
async def test_llm_api_key_watcher_merges_dotenv_with_managed_store(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_single_provider_config(
        state_env,
        config_id="openai-default",
        provider="openai",
        api_key_env="OPENAI_API_KEY",
    )
    update_api_keys_payloads: list[dict[str, str]] = []
    original_update_api_keys = state_env.agent_runner.update_api_keys

    def _capture_update_api_keys(payload: dict[str, str]) -> None:
        update_api_keys_payloads.append(dict(payload))
        original_update_api_keys(payload)

    monkeypatch.setattr(
        state_env.agent_runner, "update_api_keys", _capture_update_api_keys
    )

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "dotenv-openai-secret",
            "UNRELATED_SECRET": "do-not-expose",
        }
    )
    state_env.dbe.reload_dot_env()
    with runtime_context(state_env) as runtime_ctx:
        initial_keys = await route_get_llm_api_keys(runtime_ctx)
        assert initial_keys.apiKeys["OPENAI_API_KEY"] == "dotenv-openai-secret"
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "managed-secret"},
                expectedRevision=initial_keys.revision,
            ),
            runtime_ctx,
        )

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert update_api_keys_payloads
    assert update_api_keys_payloads[-1] == {"OPENAI_API_KEY": "managed-secret"}
    assert "UNRELATED_SECRET" not in update_api_keys_payloads[-1]


@pytest.mark.asyncio
async def test_llm_api_key_watcher_clears_runtime_keys_when_index_is_invalid(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "broken",
            _MANAGED_KEY_NAMES_ENV_VAR: "not-json",
        }
    )

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.api_keys == {}


@pytest.mark.asyncio
async def test_llm_config_watcher_does_not_fail_when_api_key_index_is_invalid(
    state_env: SettaFastAPIState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    state_env.dbe.write_dot_env(
        {
            "OPENAI_API_KEY": "broken",
            _MANAGED_KEY_NAMES_ENV_VAR: "not-json",
        }
    )

    await state_env.llm_config_watcher._reload_config()

    assert state_env.agent_runner.api_keys == {}
