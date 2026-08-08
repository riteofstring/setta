import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, cast

import pytest

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


@pytest.mark.asyncio
async def test_send_realtime_update_converts_to_temporary_ids():
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

        assert len(websocket_manager.sent_messages) == 1
        message = cast(
            "WebsocketMsgListenerRealtimeEvent",
            websocket_manager.sent_messages[0][0],
        )
        assert message.content.projectConfigId == ID("101")
        delta = message.content.deltas[0]
        dependency = delta.dependency
        assert dependency.sectionId == ID("102")
        assert dependency.codeObjId == ID("103")


@pytest.mark.asyncio
async def test_send_realtime_update_filters_and_respects_modes():
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

    assert len(websocket_manager.sent_messages) == 2
    for idx, (message_obj, websocket_id) in enumerate(
        websocket_manager.sent_messages, 1
    ):
        message = cast("WebsocketMsgListenerRealtimeEvent", message_obj)
        assert websocket_id == "socket-1"
        assert message.content.sequence == idx

    first_message = cast(
        "WebsocketMsgListenerRealtimeEvent", websocket_manager.sent_messages[0][0]
    )
    first_deltas = []
    for delta in first_message.content.deltas:
        dependency = delta.dependency
        assert isinstance(dependency, SectionParamDependencyKey)
        first_deltas.append(
            (dependency.sectionId, dependency.codeObjId, delta.value.payload)
        )
    assert first_deltas == [(ID("section-A"), ID("param-1"), "value-a")]

    second_message = cast(
        "WebsocketMsgListenerRealtimeEvent", websocket_manager.sent_messages[1][0]
    )
    second_deltas = []
    for delta in second_message.content.deltas:
        dependency = delta.dependency
        assert isinstance(dependency, SectionParamDependencyKey)
        second_deltas.append(
            (dependency.sectionId, dependency.codeObjId, delta.value.payload)
        )
    assert second_deltas == [(ID("section-Z"), ID("param-9"), "value-unmatched")]


@pytest.mark.asyncio
async def test_send_realtime_update_skips_when_no_callbacks_match():
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

    assert websocket_manager.sent_messages == []
