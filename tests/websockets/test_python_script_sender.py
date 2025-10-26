import unittest

from setta.types.listener import ListenerFeed, ListenerRegisterCallback
from setta.types.websocket import WebsocketMsgListenerRealtimeEvent
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))


class WMHPythonScriptSenderRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_realtime_update_filters_and_respects_feeds(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id="proj-1",
            callbacks={
                "cb-realtime": ListenerRegisterCallback(
                    dependencies=["dep-a"],
                    feed=ListenerFeed.REALTIME,
                ),
                "cb-both": ListenerRegisterCallback(
                    dependencies=["dep-b"],
                    feed=ListenerFeed.BOTH,
                ),
                "cb-wildcard": ListenerRegisterCallback(
                    dependencies=[],
                    feed=ListenerFeed.REALTIME,
                ),
                "cb-persisted": ListenerRegisterCallback(
                    dependencies=["dep-a"],
                    feed=ListenerFeed.PERSISTED,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-2",
            project_config_id="proj-1",
            callbacks={
                "cb-unrelated": ListenerRegisterCallback(
                    dependencies=["dep-other"],
                    feed=ListenerFeed.REALTIME,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-3",
            project_config_id="other-proj",
            callbacks={
                "cb-other-project": ListenerRegisterCallback(
                    dependencies=["dep-a"],
                    feed=ListenerFeed.REALTIME,
                ),
            },
        )

        await sender.send_realtime_update(
            projectConfigId="proj-1",
            dependencyIds=["dep-a"],
            delta={"dep-a": "value-a"},
            sequence=1,
            metadata={"source": "slider"},
        )
        await sender.send_realtime_update(
            projectConfigId="proj-1",
            dependencyIds=["dep-b"],
            delta={"dep-b": "value-b"},
            sequence=2,
        )
        await sender.send_realtime_update(
            projectConfigId="proj-1",
            dependencyIds=["dep-unmatched"],
            delta={"dep-unmatched": "value-c"},
            sequence=3,
        )

        self.assertEqual(3, len(websocket_manager.sent_messages))
        for idx, (message, websocket_id) in enumerate(
            websocket_manager.sent_messages, 1
        ):
            self.assertIsInstance(message, WebsocketMsgListenerRealtimeEvent)
            self.assertEqual("socket-1", websocket_id)
            self.assertEqual(idx, message.content.sequence)

        first_message = websocket_manager.sent_messages[0][0]
        self.assertEqual({"dep-a": "value-a"}, first_message.content.delta)
        self.assertEqual({"source": "slider"}, first_message.content.metadata)

        second_message = websocket_manager.sent_messages[1][0]
        self.assertEqual({"dep-b": "value-b"}, second_message.content.delta)

        third_message = websocket_manager.sent_messages[2][0]
        self.assertEqual(
            {"dep-unmatched": "value-c"},
            third_message.content.delta,
        )

    async def test_send_realtime_update_skips_when_no_callbacks_match(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id="proj-1",
            callbacks={
                "cb-persisted": ListenerRegisterCallback(
                    dependencies=["dep-a"],
                    feed=ListenerFeed.PERSISTED,
                ),
                "cb-realtime-other": ListenerRegisterCallback(
                    dependencies=["dep-other"],
                    feed=ListenerFeed.REALTIME,
                ),
            },
        )

        await sender.send_realtime_update(
            projectConfigId="proj-1",
            dependencyIds=["dep-a"],
            delta={"dep-a": "value-a"},
            sequence=1,
        )

        self.assertEqual([], websocket_manager.sent_messages)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
