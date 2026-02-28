import logging
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from setta.database.db_objs import DBE
from setta.llm.api_key_runtime_sync import (
    apply_managed_api_keys_write_attempt_to_runtime,
    sync_managed_api_keys_to_runtime,
)
from setta.llm.api_keys import (
    MANAGED_API_KEYS_CORRUPT_ERROR_CODE,
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    ManagedAPIKeysWriteAttempt,
    llm_api_keys_path,
    write_managed_api_keys_with_expected_revision,
)
from setta.types.llm_config import AllLLMConfigs, LLMConfig

_MANAGED_KEY_NAMES_ENV_VAR = "SETTA_MANAGED_LLM_API_KEY_NAMES"


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(root)
    dbe.dot_env = Path(tmpdir) / ".env"
    return dbe


def _build_config(*, key_name: str) -> AllLLMConfigs:
    return AllLLMConfigs(
        configs={
            "default": LLMConfig(
                id="default",
                model="test-model",
                provider="openai",
                api_key_env=key_name,
            )
        },
        default_config_id="default",
    )


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_revisioned_snapshot() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        write_result = write_managed_api_keys_with_expected_revision(
            dbe,
            {"OPENAI_API_KEY": "secret"},
            expected_revision=0,
        )
        assert write_result.status == "success"
        agent_runner = SimpleNamespace(
            config=_build_config(key_name="OPENAI_API_KEY"),
            update_api_keys=Mock(),
        )
        websocket_handler = SimpleNamespace(
            log_failure_and_broadcast_backend_log_event=AsyncMock(),
            broadcast_llm_api_keys_update=AsyncMock(),
        )

        result = await sync_managed_api_keys_to_runtime(
            dbe=dbe,
            agent_runner=agent_runner,
            websocket_msg_handler=websocket_handler,
            logger=logging.getLogger("test"),
            log_label="sync",
            corruption_message=".env API key store metadata is corrupt",
        )

        assert result.corrupt is False
        agent_runner.update_api_keys.assert_called_once_with({"OPENAI_API_KEY": "secret"})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_not_called()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.apiKeys == {"OPENAI_API_KEY": "secret"}
        assert payload.revision == write_result.revision
        assert payload.corrupt is False
        assert payload.errorCode is None
        assert payload.message is None


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_corruption_snapshot_for_invalid_index(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            "OPENAI_API_KEY=secret\n"
            f"{_MANAGED_KEY_NAMES_ENV_VAR}=not-json\n",
            encoding="utf-8",
        )
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        agent_runner = SimpleNamespace(
            config=_build_config(key_name="OPENAI_API_KEY"),
            update_api_keys=Mock(),
        )
        websocket_handler = SimpleNamespace(
            log_failure_and_broadcast_backend_log_event=AsyncMock(),
            broadcast_llm_api_keys_update=AsyncMock(),
        )

        result = await sync_managed_api_keys_to_runtime(
            dbe=dbe,
            agent_runner=agent_runner,
            websocket_msg_handler=websocket_handler,
            logger=logging.getLogger("test"),
            log_label="sync",
            corruption_message=".env API key store metadata is corrupt",
        )

        assert result.corrupt is True
        agent_runner.update_api_keys.assert_called_once_with({})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_awaited()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.apiKeys == {}
        assert payload.revision == 0
        assert payload.corrupt is True
        assert payload.errorCode == MANAGED_API_KEYS_CORRUPT_ERROR_CODE
        assert payload.message == "Managed API key index in .env is not valid JSON."


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_unavailable_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.mkdir()
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        agent_runner = SimpleNamespace(
            config=_build_config(key_name="OPENAI_API_KEY"),
            update_api_keys=Mock(),
        )
        websocket_handler = SimpleNamespace(
            log_failure_and_broadcast_backend_log_event=AsyncMock(),
            broadcast_llm_api_keys_update=AsyncMock(),
        )

        result = await sync_managed_api_keys_to_runtime(
            dbe=dbe,
            agent_runner=agent_runner,
            websocket_msg_handler=websocket_handler,
            logger=logging.getLogger("test"),
            log_label="sync",
            corruption_message=".env API key store metadata is corrupt",
        )

        assert result.corrupt is False
        assert result.error_code == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE
        agent_runner.update_api_keys.assert_called_once_with({})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_not_called()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.errorCode == MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE


@pytest.mark.asyncio
async def test_apply_managed_api_keys_write_attempt_to_runtime_uses_write_payload() -> (
    None
):
    agent_runner = SimpleNamespace(
        config=_build_config(key_name="OPENAI_API_KEY"),
        update_api_keys=Mock(),
    )
    websocket_handler = SimpleNamespace(
        broadcast_llm_api_keys_update=AsyncMock(),
    )
    write_attempt = ManagedAPIKeysWriteAttempt(
        status="success",
        api_keys={"OPENAI_API_KEY": "saved-secret"},
        revision=5,
    )

    await apply_managed_api_keys_write_attempt_to_runtime(
        write_attempt=write_attempt,
        agent_runner=agent_runner,
        websocket_msg_handler=websocket_handler,
    )

    agent_runner.update_api_keys.assert_called_once_with(
        {"OPENAI_API_KEY": "saved-secret"}
    )
    websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
    payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
    assert payload.apiKeys == {"OPENAI_API_KEY": "saved-secret"}
    assert payload.revision == 5
    assert payload.corrupt is False
    assert payload.errorCode is None
    assert payload.message is None


@pytest.mark.asyncio
async def test_apply_managed_api_keys_write_attempt_to_runtime_includes_process_env_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "process-secret")
    agent_runner = SimpleNamespace(
        config=_build_config(key_name="ANTHROPIC_API_KEY"),
        update_api_keys=Mock(),
    )
    websocket_handler = SimpleNamespace(
        broadcast_llm_api_keys_update=AsyncMock(),
    )
    write_attempt = ManagedAPIKeysWriteAttempt(
        status="success",
        api_keys={},
        revision=0,
    )

    await apply_managed_api_keys_write_attempt_to_runtime(
        write_attempt=write_attempt,
        agent_runner=agent_runner,
        websocket_msg_handler=websocket_handler,
    )

    agent_runner.update_api_keys.assert_called_once_with(
        {"ANTHROPIC_API_KEY": "process-secret"}
    )
    payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
    assert payload.apiKeys == {"ANTHROPIC_API_KEY": "process-secret"}
    assert payload.revision == 0


@pytest.mark.asyncio
async def test_apply_managed_api_keys_write_attempt_to_runtime_rejects_non_success() -> (
    None
):
    agent_runner = SimpleNamespace(
        config=_build_config(key_name="OPENAI_API_KEY"),
        update_api_keys=Mock(),
    )
    websocket_handler = SimpleNamespace(
        broadcast_llm_api_keys_update=AsyncMock(),
    )
    failed_attempt = ManagedAPIKeysWriteAttempt(
        status="revision_conflict",
        api_keys={},
        revision=2,
    )

    with pytest.raises(ValueError, match="must be successful"):
        await apply_managed_api_keys_write_attempt_to_runtime(
            write_attempt=failed_attempt,
            agent_runner=agent_runner,
            websocket_msg_handler=websocket_handler,
        )

    agent_runner.update_api_keys.assert_not_called()
    websocket_handler.broadcast_llm_api_keys_update.assert_not_called()
