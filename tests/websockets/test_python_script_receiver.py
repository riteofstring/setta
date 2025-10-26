from __future__ import annotations

import unittest

from setta.types.listener import (
    ListenerFeed,
    ListenerFrontendEmitContent,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.websocket import (
    WebsocketConnectionType,
    WebsocketMsgListenerError,
    WebsocketMsgListenerFrontendEmit,
    WebsocketMsgListenerFrontendEmitForward,
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []
        self.broadcasts: list[tuple[object, object | None, object | None]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))

    async def broadcast(
        self,
        message,
        connectionType=None,
        currentAddress=None,
    ):
        self.broadcasts.append((message, connectionType, currentAddress))


class WMHPythonScriptReceiverTest(unittest.IsolatedAsyncioTestCase):
    async def test_listener_register_stores_registration_and_sends_ack(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        receiver = WMHPythonScriptReceiver(
            websocket_manager, listener_registry, frontend_sender
        )
        callback = ListenerRegisterCallback(
            dependencies=["sections_Homepage__hero__title"],
            feed=ListenerFeed.BOTH,
        )
        content = ListenerRegisterContent(
            projectConfigId="proj-123",
            callbacks={"cb-1": callback},
        )
        message = WebsocketMsgListenerRegister(content=content)

        await receiver.process_json_str(
            message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        registration = listener_registry.get_registration("socket-1")
        self.assertIsNotNone(registration)
        assert registration is not None  # help type checkers
        self.assertEqual("proj-123", registration.project_config_id)
        self.assertIn("cb-1", registration.callbacks)
        self.assertEqual(
            ListenerFeed.BOTH,
            registration.callbacks["cb-1"].feed,
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        ack_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(ack_message, WebsocketMsgListenerRegisterAck)
        self.assertEqual("proj-123", ack_message.content.projectConfigId)
        self.assertEqual(1, len(ack_message.content.callbacks))
        self.assertIn("cb-1", ack_message.content.callbacks)
        self.assertEqual("accepted", ack_message.content.callbacks["cb-1"].status)

        await receiver.on_disconnect("socket-1")
        self.assertIsNone(listener_registry.get_registration("socket-1"))

    async def test_listener_frontend_emit_forwards_to_frontend_without_ack(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            feed=ListenerFeed.BOTH,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitContent(
                projectConfigId="proj-123",
                payload={"panel": "chat", "value": "hello"},
                target="chat-panel",
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.broadcasts))
        forwarded_message, connection_type, _ = websocket_manager.broadcasts[0]
        self.assertIsInstance(
            forwarded_message,
            WebsocketMsgListenerFrontendEmitForward,
        )
        self.assertEqual(WebsocketConnectionType.FRONTEND, connection_type)
        self.assertEqual(emit_message.content, forwarded_message.content)
        self.assertEqual([], websocket_manager.sent_messages)

    async def test_listener_frontend_emit_rejects_unregistered_socket(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
        )
        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitContent(
                projectConfigId="proj-123",
                payload={"panel": "chat", "value": "hello"},
                target=None,
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-unknown",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-unknown", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("listener_not_registered", error_message.content.error)
        self.assertEqual(
            {"websocketId": "socket-unknown"},
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)

    async def test_listener_frontend_emit_rejects_project_config_mismatch(self):
        websocket_manager = _StubWebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        listener_registry = ListenerRegistry()
        receiver = WMHPythonScriptReceiver(
            websocket_manager,
            listener_registry,
            frontend_sender,
        )
        callback = ListenerRegisterCallback(
            dependencies=[],
            feed=ListenerFeed.BOTH,
        )
        register_message = WebsocketMsgListenerRegister(
            content=ListenerRegisterContent(
                projectConfigId="proj-123",
                callbacks={"cb-1": callback},
            )
        )
        await receiver.process_json_str(
            register_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )
        websocket_manager.sent_messages.clear()

        emit_message = WebsocketMsgListenerFrontendEmit(
            content=ListenerFrontendEmitContent(
                projectConfigId="proj-unknown",
                payload={"panel": "chat", "value": "hello"},
                target=None,
            )
        )

        await receiver.process_json_str(
            emit_message.model_dump_json(),
            fromWebsocketId="socket-1",
        )

        self.assertEqual(1, len(websocket_manager.sent_messages))
        error_message, websocket_id = websocket_manager.sent_messages[0]
        self.assertEqual("socket-1", websocket_id)
        self.assertIsInstance(error_message, WebsocketMsgListenerError)
        self.assertEqual("project_config_mismatch", error_message.content.error)
        self.assertEqual(
            {
                "expectedProjectConfigId": "proj-123",
                "receivedProjectConfigId": "proj-unknown",
            },
            error_message.content.details,
        )
        self.assertEqual([], websocket_manager.broadcasts)
