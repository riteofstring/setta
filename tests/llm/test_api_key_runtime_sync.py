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
    MANAGED_API_KEYS_UNAVAILABLE_ERROR_CODE,
    ManagedAPIKeysWriteAttempt,
    llm_api_keys_path,
    write_managed_api_keys_with_expected_revision,
)


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


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
        agent_runner = SimpleNamespace(update_api_keys=Mock())
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
            corruption_message="managed key store corrupt",
        )

        assert result.corrupt is False
        agent_runner.update_api_keys.assert_called_once_with({"OPENAI_API_KEY": "secret"})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_not_called()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.apiKeys == {"OPENAI_API_KEY": "secret"}
        assert payload.revision == 1
        assert payload.corrupt is False
        assert payload.errorCode is None
        assert payload.message is None


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_corruption_snapshot() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('{"revision": 1, "apiKeys": {"OPENAI_API_KEY": "   "}}')
        agent_runner = SimpleNamespace(update_api_keys=Mock())
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
            corruption_message="managed key store corrupt",
        )

        assert result.corrupt is True
        agent_runner.update_api_keys.assert_called_once_with({})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_awaited()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.apiKeys == {}
        assert payload.revision == 0
        assert payload.corrupt is True
        assert payload.errorCode == "managed_api_keys_store_corrupt"
        assert payload.message == "Managed API key values must be non-empty strings."


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_corruption_snapshot_for_invalid_utf8() -> (
    None
):
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\xff\xfe\xfd")
        agent_runner = SimpleNamespace(update_api_keys=Mock())
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
            corruption_message="managed key store corrupt",
        )

        assert result.corrupt is True
        agent_runner.update_api_keys.assert_called_once_with({})
        websocket_handler.log_failure_and_broadcast_backend_log_event.assert_awaited()
        websocket_handler.broadcast_llm_api_keys_update.assert_called_once()
        payload = websocket_handler.broadcast_llm_api_keys_update.await_args.args[0]
        assert payload.apiKeys == {}
        assert payload.revision == 0
        assert payload.corrupt is True
        assert payload.errorCode == "managed_api_keys_store_corrupt"
        assert payload.message is not None
        if payload.message is None:
            raise AssertionError("Expected typed invalid UTF-8 corruption message")
        assert "not valid UTF-8" in payload.message


@pytest.mark.asyncio
async def test_sync_managed_api_keys_broadcasts_unavailable_snapshot() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = _build_dbe(tmpdir)
        path = llm_api_keys_path(dbe)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.mkdir()
        agent_runner = SimpleNamespace(update_api_keys=Mock())
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
            corruption_message="managed key store corrupt",
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
    agent_runner = SimpleNamespace(update_api_keys=Mock())
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
async def test_apply_managed_api_keys_write_attempt_to_runtime_rejects_non_success() -> (
    None
):
    agent_runner = SimpleNamespace(update_api_keys=Mock())
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
