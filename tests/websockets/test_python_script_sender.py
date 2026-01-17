import tempfile
import unittest
from pathlib import Path
from typing import TYPE_CHECKING, cast

from setta.database.db_objs import DBE
from setta.types.dependency_key import (
    SectionParamDependencyKey,
    create_dep_key,
)
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRealtimeDelta,
    ListenerRegisterCallback,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.types.websocket import WebsocketMsgListenerRealtimeEvent
    from setta.websockets.websocket_manager import WebsocketManager


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []

    async def send_message(self, message, toWebsocketId: str):
        self.sent_messages.append((message, toWebsocketId))


class WMHPythonScriptSenderRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_realtime_update_converts_to_temporary_ids(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            dbe.write_temporary_id_map(
                {
                    ID("proj-1"): ID("101"),
                    ID("section-A"): ID("102"),
                    ID("param-1"): ID("103"),
                }
            )
            sender = WMHPythonScriptSender(
                cast("WebsocketManager", websocket_manager), listener_registry, dbe
            )

            listener_registry.record_bootstrap(
                websocket_id="socket-1",
                project_config_id=ID("proj-1"),
                use_temporary_ids=True,
            )
            listener_registry.upsert_registration(
                websocket_id="socket-1",
                project_config_id=ID("proj-1"),
                callbacks={
                    "cb-specific": ListenerRegisterCallback(
                        dependencies=[
                            create_dep_key(
                                sectionId=ID("section-A"),
                                codeObjId=ID("param-1"),
                            )
                        ],
                        dependencyMode=ListenerDependencyMode.ALWAYS,
                    ),
                },
            )

            await sender.send_realtime_update(
                projectConfigId=ID("proj-1"),
                deltas=[
                    ListenerRealtimeDelta(
                        dependency=create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-1"),
                        ),
                        value=LiteralDependencyValue("value-a"),
                    )
                ],
                sequence=1,
            )

            self.assertEqual(1, len(websocket_manager.sent_messages))
            message = cast(
                "WebsocketMsgListenerRealtimeEvent",
                websocket_manager.sent_messages[0][0],
            )
            self.assertEqual(ID("101"), message.content.projectConfigId)
            delta = message.content.deltas[0]
            dependency = delta.dependency
            self.assertEqual(ID("102"), dependency.sectionId)
            self.assertEqual(ID("103"), dependency.codeObjId)

    async def test_send_realtime_update_filters_and_respects_modes(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(
            cast("WebsocketManager", websocket_manager), listener_registry
        )

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id=ID("proj-1"),
            callbacks={
                "cb-specific": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-1"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
                "cb-additional": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-2"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
                "cb-any": ListenerRegisterCallback(
                    dependencies=[],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
                "cb-refresh-only": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-1"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-2",
            project_config_id=ID("proj-1"),
            callbacks={
                "cb-unrelated": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-B"),
                            codeObjId=ID("param-3"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
            },
        )
        listener_registry.upsert_registration(
            websocket_id="socket-3",
            project_config_id=ID("other-proj"),
            callbacks={
                "cb-other-project": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-1"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
            },
        )

        deltas_specific = [
            ListenerRealtimeDelta(
                dependency=create_dep_key(
                    sectionId=ID("section-A"),
                    codeObjId=ID("param-1"),
                ),
                value=LiteralDependencyValue("value-a"),
            )
        ]
        await sender.send_realtime_update(
            projectConfigId=ID("proj-1"),
            deltas=deltas_specific,
            sequence=1,
        )

        deltas_unmatched = [
            ListenerRealtimeDelta(
                dependency=create_dep_key(
                    sectionId=ID("section-Z"),
                    codeObjId=ID("param-9"),
                ),
                value=LiteralDependencyValue("value-unmatched"),
            )
        ]
        await sender.send_realtime_update(
            projectConfigId=ID("proj-1"),
            deltas=deltas_unmatched,
            sequence=2,
        )

        self.assertEqual(2, len(websocket_manager.sent_messages))
        for idx, (message_obj, websocket_id) in enumerate(
            websocket_manager.sent_messages, 1
        ):
            message = cast("WebsocketMsgListenerRealtimeEvent", message_obj)
            self.assertEqual("socket-1", websocket_id)
            self.assertEqual(idx, message.content.sequence)

        first_message = cast(
            "WebsocketMsgListenerRealtimeEvent", websocket_manager.sent_messages[0][0]
        )
        first_deltas = []
        for delta in first_message.content.deltas:
            dependency = delta.dependency
            self.assertIsInstance(dependency, SectionParamDependencyKey)
            first_deltas.append(
                (dependency.sectionId, dependency.codeObjId, delta.value.payload)
            )
        self.assertEqual(
            [
                (ID("section-A"), ID("param-1"), "value-a"),
            ],
            first_deltas,
        )

        second_message = cast(
            "WebsocketMsgListenerRealtimeEvent", websocket_manager.sent_messages[1][0]
        )
        second_deltas = []
        for delta in second_message.content.deltas:
            dependency = delta.dependency
            self.assertIsInstance(dependency, SectionParamDependencyKey)
            second_deltas.append(
                (dependency.sectionId, dependency.codeObjId, delta.value.payload)
            )
        self.assertEqual(
            [
                (ID("section-Z"), ID("param-9"), "value-unmatched"),
            ],
            second_deltas,
        )

    async def test_send_realtime_update_skips_when_no_callbacks_match(self):
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(
            cast("WebsocketManager", websocket_manager), listener_registry
        )

        listener_registry.upsert_registration(
            websocket_id="socket-1",
            project_config_id=ID("proj-1"),
            callbacks={
                "cb-refresh-only": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-A"),
                            codeObjId=ID("param-1"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.REFRESH_ONLY,
                ),
                "cb-other": ListenerRegisterCallback(
                    dependencies=[
                        create_dep_key(
                            sectionId=ID("section-B"),
                            codeObjId=ID("param-2"),
                        )
                    ],
                    dependencyMode=ListenerDependencyMode.ALWAYS,
                ),
            },
        )

        await sender.send_realtime_update(
            projectConfigId=ID("proj-1"),
            deltas=[
                ListenerRealtimeDelta(
                    dependency=create_dep_key(
                        sectionId=ID("section-A"),
                        codeObjId=ID("param-1"),
                    ),
                    value=LiteralDependencyValue("value-a"),
                )
            ],
            sequence=1,
        )

        self.assertEqual([], websocket_manager.sent_messages)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
