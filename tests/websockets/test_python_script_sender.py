import unittest

from setta.types.listener import (
    ListenerDependencyKey,
    ListenerDependencyMode,
    ListenerFeed,
    ListenerRealtimeDelta,
    ListenerRegisterCallback,
)
from setta.types.websocket import WebsocketMsgListenerRealtimeEvent
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))


class WMHPythonScriptSenderRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_realtime_update_filters_and_respects_modes(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id="proj-1",
            callbacks={
                "cb-specific": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A",
                            codeObjId="param-1",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                ),
                "cb-additional": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A",
                            codeObjId="param-2",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                ),
                "cb-any": ListenerRegisterCallback(
                    dependencies=[],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.ANY_DEPENDENCY,
                ),
                "cb-refresh-only": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A",
                            codeObjId="param-1",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-2",
            project_config_id="proj-1",
            callbacks={
                "cb-unrelated": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-B",
                            codeObjId="param-3",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-3",
            project_config_id="other-proj",
            callbacks={
                "cb-other-project": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A",
                            codeObjId="param-1",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                ),
            },
        )

        deltas_specific = [
            ListenerRealtimeDelta(
                dependency=ListenerDependencyKey(
                    sectionId="section-A",
                    codeObjId="param-1",
                ),
                value="value-a",
            )
        ]
        await sender.send_realtime_update(
            projectConfigId="proj-1",
            deltas=deltas_specific,
            sequence=1,
        )

        deltas_unmatched = [
            ListenerRealtimeDelta(
                dependency=ListenerDependencyKey(
                    sectionId="section-Z",
                    codeObjId="param-9",
                ),
                value="value-unmatched",
            )
        ]
        await sender.send_realtime_update(
            projectConfigId="proj-1",
            deltas=deltas_unmatched,
            sequence=2,
        )

        self.assertEqual(2, len(websocket_manager.sent_messages))
        for idx, (message, websocket_id) in enumerate(
            websocket_manager.sent_messages, 1
        ):
            self.assertIsInstance(message, WebsocketMsgListenerRealtimeEvent)
            self.assertEqual("socket-1", websocket_id)
            self.assertEqual(idx, message.content.sequence)

        first_message = websocket_manager.sent_messages[0][0]
        self.assertEqual(
            [
                ("section-A", "param-1", "value-a"),
            ],
            [
                (
                    delta.dependency.sectionId,
                    delta.dependency.codeObjId,
                    delta.value,
                )
                for delta in first_message.content.deltas
            ],
        )

        second_message = websocket_manager.sent_messages[1][0]
        self.assertEqual(
            [
                ("section-Z", "param-9", "value-unmatched"),
            ],
            [
                (
                    delta.dependency.sectionId,
                    delta.dependency.codeObjId,
                    delta.value,
                )
                for delta in second_message.content.deltas
            ],
        )

    async def test_send_realtime_update_skips_when_no_callbacks_match(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id="proj-1",
            callbacks={
                "cb-refresh-only": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A",
                            codeObjId="param-1",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
                ),
                "cb-other": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-B",
                            codeObjId="param-2",
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                ),
            },
        )

        await sender.send_realtime_update(
            projectConfigId="proj-1",
            deltas=[
                ListenerRealtimeDelta(
                    dependency=ListenerDependencyKey(
                        sectionId="section-A",
                        codeObjId="param-1",
                    ),
                    value="value-a",
                )
            ],
            sequence=1,
        )

        self.assertEqual([], websocket_manager.sent_messages)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
