"""Shared runtime sync path for managed LLM API keys."""

import logging
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.api_keys import (
    ManagedAPIKeysReadResult,
    ManagedAPIKeysWriteAttempt,
    build_managed_api_keys_snapshot,
    read_managed_api_keys_with_status,
)
from setta.types.notifications import SettaBackendLogEventSeverity

if TYPE_CHECKING:  # pragma: no cover
    from setta.llm.agent_runner import AgentRunner
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


async def sync_managed_api_keys_to_runtime(
    *,
    dbe: DBE,
    agent_runner: "AgentRunner",
    websocket_msg_handler: "WMHFrontendSender",
    logger: logging.Logger,
    log_label: str,
    corruption_message: str,
    context: dict[str, str] | None = None,
) -> ManagedAPIKeysReadResult:
    managed_api_keys = read_managed_api_keys_with_status(dbe)
    if managed_api_keys.corrupt:
        corruption_error = ValueError(
            managed_api_keys.error or "Managed API key store is corrupt."
        )
        await websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
            corruption_error,
            label=log_label,
            message=corruption_message,
            severity=SettaBackendLogEventSeverity.error,
            handled=True,
            logger=logger,
            context=context,
        )
    agent_runner.update_api_keys(managed_api_keys.api_keys)
    await websocket_msg_handler.broadcast_llm_api_keys_update(
        build_managed_api_keys_snapshot(managed_api_keys)
    )
    return managed_api_keys


async def apply_managed_api_keys_write_attempt_to_runtime(
    *,
    write_attempt: ManagedAPIKeysWriteAttempt,
    agent_runner: "AgentRunner",
    websocket_msg_handler: "WMHFrontendSender",
) -> None:
    if write_attempt.status != "success":
        raise ValueError(
            "Managed API key write attempt must be successful for runtime sync."
        )
    snapshot_payload = ManagedAPIKeysReadResult(
        api_keys=write_attempt.api_keys,
        revision=write_attempt.revision,
        corrupt=False,
    )
    agent_runner.update_api_keys(write_attempt.api_keys)
    await websocket_msg_handler.broadcast_llm_api_keys_update(
        build_managed_api_keys_snapshot(snapshot_payload)
    )
