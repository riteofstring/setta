import json

from setta.api.listener import (
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
    SettaListener,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerForceRefreshEvent,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.generated.go_shared_types import (
    DependencyValueType,
    ListenerErrorContent,
    ListenerErrorMessage,
    ListenerMessageType,
    LiteralDependencyValue,
)
from setta.types.id import ID
from setta.types.protocol import create_dep_key


def _literal_dependency_value(payload: str) -> LiteralDependencyValue:
    return LiteralDependencyValue(
        type=DependencyValueType.Literal,
        payload=payload,
    )


def test_parse_text_realtime_event_uses_control_message_mapping() -> None:
    listener = SettaListener(project_name="Text Parse")
    dependency = create_dep_key(sectionId=ID("section-1"))
    content = ListenerRealtimeEventContent(
        projectConfigId=ID("project-1"),
        deltas=[
            ListenerRealtimeDelta(
                dependency=dependency,
                value=_literal_dependency_value("hello"),
            )
        ],
        sequence=1,
    )
    payload = json.dumps(
        {
            "messageType": ListenerMessageType.ListenerRealtimeEvent.value,
            "content": content.model_dump(mode="json"),
        }
    )

    parsed = listener._parse_websocket_payload(payload)

    assert isinstance(parsed, ListenerRealtimeEventContent)
    assert parsed.model_dump(mode="json") == content.model_dump(mode="json")


def test_parse_listener_control_message_accepts_enum_message_type() -> None:
    listener = SettaListener(project_name="Control Parse")
    dependency = create_dep_key(sectionId=ID("section-1"))
    content = ListenerForceRefreshEvent(
        snapshot=ListenerSnapshot(
            projectConfigId=ID("project-1"),
            dependencyCatalog=ListenerDependencyCatalog(
                entries=[
                    ListenerDependencyCatalogEntry(
                        dependencyKey=dependency,
                        name="Welcome",
                        fullPathName="Welcome",
                    )
                ]
            ),
            dependencyValues=ListenerRenderedDependencyValues(
                entries=[
                    ListenerRenderedDependencyValue(
                        dependencyKey=dependency,
                        renderedValue="Snapshot text",
                    )
                ]
            ),
        )
    )

    parsed = listener._parse_listener_control_message(
        {
            "messageType": ListenerMessageType.ListenerForceRefresh,
            "content": content.model_dump(mode="json"),
        },
        payload="<inline>",
    )

    assert isinstance(parsed, ListenerForceRefreshEvent)
    assert parsed.model_dump(mode="json") == content.model_dump(mode="json")


def test_parse_text_generated_listener_message_uses_generated_mapping() -> None:
    listener = SettaListener(project_name="Generated Parse")
    message = ListenerErrorMessage(
        messageType=ListenerMessageType.ListenerError,
        content=ListenerErrorContent(
            error="listener_refresh_failed",
            details={"callId": "call-1"},
        ),
    )

    parsed = listener._parse_websocket_payload(message.model_dump_json())

    assert isinstance(parsed, ListenerErrorMessage)
    assert parsed.model_dump(mode="json") == message.model_dump(mode="json")
