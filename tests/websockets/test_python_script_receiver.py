from __future__ import annotations

import unittest

from setta.types.listener import (
    ListenerFeed,
    ListenerRegisterCallback,
    ListenerRegisterContent,
)
from setta.types.websocket import (
    WebsocketMsgListenerRegister,
    WebsocketMsgListenerRegisterAck,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_receiver import (
    WMHPythonScriptReceiver,
)


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))


class WMHPythonScriptReceiverTest(unittest.IsolatedAsyncioTestCase):
    async def test_listener_register_stores_registration_and_sends_ack(self):
        listener_registry = ListenerRegistry()
        websocket_manager = _StubWebsocketManager()
        receiver = WMHPythonScriptReceiver(websocket_manager, listener_registry)
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
