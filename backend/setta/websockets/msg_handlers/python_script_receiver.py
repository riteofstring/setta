import logging
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from setta.api.listener import ListenerFeed
from setta.types.websocket import (
    ListenerRegisterCallback,
    ListenerRegisterContent,
    WebsocketMsg,
    WebsocketMsgTypeForPythonScript,
)
from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

logger = logging.getLogger(__name__)


class WMHPythonScriptReceiver(BaseWebsocketMsgReceiver):
    @dataclass(slots=True)
    class _RegisteredCallback:
        callback_id: str
        dependencies: tuple[Any, ...]
        feed: ListenerFeed
        debounce_ms: int | None
        throttle_ms: int | None
        run_on_refresh: bool

    @dataclass(slots=True)
    class _ListenerSession:
        websocket_id: str
        project_config_id: str
        callbacks: dict[str, "_RegisteredCallback"] = field(default_factory=dict)

    def __init__(
        self,
        websocket_manager,
        sender: WMHPythonScriptSender,
        *,
        heartbeat_interval_sec: float | None = None,
    ):
        super().__init__(websocket_manager)
        self._sender = sender
        self._sessions: dict[str, WMHPythonScriptReceiver._ListenerSession] = {}
        self._heartbeat_interval_sec = heartbeat_interval_sec

    async def on_disconnect(self, websocket_id: str):
        if websocket_id in self._sessions:
            logger.debug("listener socket %s disconnected; clearing session", websocket_id)
            del self._sessions[websocket_id]

    async def process_json_str(self, json_str: str, fromWebsocketId: str):
        message = WebsocketMsg.model_validate_json(json_str)
        if isinstance(message.messageType, str):
            try:
                message_type = WebsocketMsgTypeForPythonScript(message.messageType)
            except ValueError:
                await self._sender.send_error(
                    error=f"unknown python-script message type {message.messageType!r}",
                    details={"receivedType": message.messageType},
                    to_websocket_id=fromWebsocketId,
                )
                return
        else:
            await self._sender.send_error(
                error="python-script message type must be a string",
                details={"receivedType": message.messageType},
                to_websocket_id=fromWebsocketId,
            )
            return

        if (
            fromWebsocketId not in self._sessions
            and message_type != WebsocketMsgTypeForPythonScript.ListenerRegister
        ):
            await self._sender.send_error(
                error="listener must register before sending other messages",
                details={"receivedType": message_type.value},
                to_websocket_id=fromWebsocketId,
            )
            return

        if message_type == WebsocketMsgTypeForPythonScript.ListenerRegister:
            await self._handle_register(message.content, fromWebsocketId)
            return

        logger.debug(
            "python-script message %s is not yet handled; ignoring for websocket %s",
            message_type.value,
            fromWebsocketId,
        )

    async def _handle_register(self, raw_content: Any, websocket_id: str):
        try:
            payload = ListenerRegisterContent.model_validate(raw_content)
        except ValidationError as exc:
            await self._sender.send_error(
                error="invalid register payload",
                details=exc.errors(include_url=False),
                to_websocket_id=websocket_id,
            )
            return

        if not payload.project_config_id:
            await self._sender.send_error(
                error="register payload missing project_config_id",
                details=None,
                to_websocket_id=websocket_id,
            )
            return

        if not payload.callbacks:
            await self._sender.send_error(
                error="register payload must include at least one callback",
                details=None,
                to_websocket_id=websocket_id,
            )
            return

        callbacks: dict[str, WMHPythonScriptReceiver._RegisteredCallback] = {}
        for callback in payload.callbacks:
            stored = await self._normalize_callback(callback, websocket_id)
            if stored is None:
                return
            callbacks[stored.callback_id] = stored

        session = WMHPythonScriptReceiver._ListenerSession(
            websocket_id=websocket_id,
            project_config_id=payload.project_config_id,
            callbacks=callbacks,
        )
        self._sessions[websocket_id] = session
        logger.debug(
            "listener socket %s registered %s callback(s) for project %s",
            websocket_id,
            len(callbacks),
            payload.project_config_id,
        )
        await self._sender.send_ack(
            message=f"registered {len(callbacks)} listener callback(s)",
            heartbeatIntervalSec=self._heartbeat_interval_sec,
            to_websocket_id=websocket_id,
        )

    async def _normalize_callback(
        self,
        callback: ListenerRegisterCallback,
        websocket_id: str,
    ) -> "_RegisteredCallback | None":
        if not callback.callback_id:
            await self._sender.send_error(
                error="listener callback registration missing callback_id",
                details=None,
                to_websocket_id=websocket_id,
            )
            return None
        try:
            feed = ListenerFeed(callback.feed)
        except ValueError:
            await self._sender.send_error(
                error=f"unknown feed selection {callback.feed!r}",
                details={"callback_id": callback.callback_id},
                to_websocket_id=websocket_id,
            )
            return None

        return WMHPythonScriptReceiver._RegisteredCallback(
            callback_id=callback.callback_id,
            dependencies=tuple(callback.dependencies),
            feed=feed,
            debounce_ms=callback.debounce_ms,
            throttle_ms=callback.throttle_ms,
            run_on_refresh=callback.run_on_refresh,
        )
