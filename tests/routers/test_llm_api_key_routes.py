from collections.abc import AsyncIterator
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI
import pytest
import pytest_asyncio

from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.llm.api_keys import llm_api_keys_path, read_managed_api_keys
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
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(apiKeys={"UNSCOPED_CUSTOM_KEY": "custom-secret"}),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert response["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    assert keys_from_get["UNSCOPED_CUSTOM_KEY"] == "custom-secret"
    assert read_managed_api_keys(state_env.dbe)["UNSCOPED_CUSTOM_KEY"] == "custom-secret"

    # Runtime provider execution still uses the filtered key map.
    assert state_env.agent_runner.api_keys == {}


@pytest.mark.asyncio
async def test_llm_api_keys_routes_remove_key_on_empty_value(
    state_env: SettaFastAPIState,
) -> None:
    # Sending an empty value deletes that key from persisted env storage.
    with runtime_context(state_env) as runtime_ctx:
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(apiKeys={"UNSCOPED_CUSTOM_KEY": "custom-secret"}),
            runtime_ctx,
        )
        response = await route_set_llm_api_keys(
            UpdateAPIKeysRequest(apiKeys={"UNSCOPED_CUSTOM_KEY": ""}),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert "UNSCOPED_CUSTOM_KEY" not in response
    assert "UNSCOPED_CUSTOM_KEY" not in keys_from_get


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
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(apiKeys={"OPENAI_API_KEY": "managed-secret"}),
            runtime_ctx,
        )
        keys_from_get = await route_get_llm_api_keys(runtime_ctx)

    assert keys_from_get == {"OPENAI_API_KEY": "managed-secret"}
    assert "UNRELATED_SECRET" not in keys_from_get
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
        await route_set_llm_api_keys(
            UpdateAPIKeysRequest(apiKeys={"OPENAI_API_KEY": "managed-secret"}),
            runtime_ctx,
        )

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.raw_env_vars == {"OPENAI_API_KEY": "managed-secret"}
    assert "UNRELATED_SECRET" not in state_env.agent_runner.raw_env_vars


@pytest.mark.asyncio
async def test_llm_api_key_watcher_keeps_existing_keys_when_managed_store_is_invalid(
    state_env: SettaFastAPIState,
) -> None:
    # Invalid managed payloads should not clear in-memory keys via fail-open coercion.
    state_env.agent_runner.update_api_keys({"OPENAI_API_KEY": "existing-secret"})
    state_env.dbe.write_json(llm_api_keys_path(state_env.dbe), [])

    await state_env.llm_api_key_watcher._reload_from_disk()

    assert state_env.agent_runner.raw_env_vars == {"OPENAI_API_KEY": "existing-secret"}
