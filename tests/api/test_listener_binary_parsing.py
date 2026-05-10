import json

from setta.api.listener import (
    DependencyEvent,
    ListenerDependencyEventContent,
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
    BinaryDependencyValue,
    ContentRef,
    DependencyValueType,
    ListenerMessageType,
    LiteralDependencyValue,
)
from setta.types.id import ID
from setta.types.protocol import create_dep_key

from tests.helpers.binary_frames import encode_binary_frame


def _literal_dependency_value(payload: str) -> LiteralDependencyValue:
    return LiteralDependencyValue(
        type=DependencyValueType.Literal,
        payload=payload,
    )


def _binary_dependency_value(payload: ContentRef) -> BinaryDependencyValue:
    return BinaryDependencyValue(
        type=DependencyValueType.Binary,
        payload=payload,
    )


class TestSettaListenerBinaryParsing:
    def test_text_realtime_event_round_trips_through_parser(self) -> None:
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
        assert parsed.projectConfigId == ID("project-1")
        assert parsed.deltas[0].dependency == dependency
        assert parsed.deltas[0].value == _literal_dependency_value("hello")

    def test_text_dependency_event_round_trips_through_parser(self) -> None:
        listener = SettaListener(project_name="Text Parse")
        dependency = create_dep_key(sectionId=ID("section-1"))
        content = ListenerDependencyEventContent(
            projectConfigId=ID("project-1"),
            dependencyEvents=[
                DependencyEvent(
                    dependencyKey=dependency,
                    payload=_literal_dependency_value("updated"),
                    timestampMs=123,
                )
            ],
            sequence=1,
        )
        payload = json.dumps(
            {
                "messageType": ListenerMessageType.ListenerDependencyEvent.value,
                "content": content.model_dump(mode="json"),
            }
        )

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, ListenerDependencyEventContent)
        assert parsed.projectConfigId == ID("project-1")
        assert parsed.dependencyEvents[0].dependencyKey == dependency
        assert parsed.dependencyEvents[0].payload == _literal_dependency_value(
            "updated"
        )

    def test_text_force_refresh_round_trips_through_parser(self) -> None:
        listener = SettaListener(project_name="Text Parse")
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
        payload = json.dumps(
            {
                "messageType": ListenerMessageType.ListenerForceRefresh.value,
                "content": content.model_dump(mode="json"),
            }
        )

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, ListenerForceRefreshEvent)
        assert parsed.snapshot.projectConfigId == ID("project-1")
        assert parsed.snapshot.dependencyCatalog.entries
        assert parsed.snapshot.dependencyValues.entries

    def test_binary_realtime_event_applies_payload_to_all_deltas(self) -> None:
        listener = SettaListener(project_name="Binary Parse")
        dependency_one = create_dep_key(sectionId=ID("section-1"))
        dependency_two = create_dep_key(sectionId=ID("section-2"))
        ref = ContentRef(
            contentId="binary-1",
            byteLength=3,
            mimeType="image/png",
            sha256="binary-1-sha256",
        )
        delta_one = ListenerRealtimeDelta(
            dependency=dependency_one,
            value=_binary_dependency_value(ref),
        )
        delta_two = ListenerRealtimeDelta(
            dependency=dependency_two,
            value=_binary_dependency_value(ref),
        )
        content = ListenerRealtimeEventContent(
            projectConfigId=ID("project-1"),
            deltas=[delta_one, delta_two],
            sequence=1,
        )
        payload = encode_binary_frame(
            {
                "messageType": ListenerMessageType.ListenerRealtimeEvent.value,
                "content": content.model_dump(mode="json"),
            },
            b"payload",
        )

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, ListenerRealtimeEventContent)
        assert parsed.deltas[0].binaryPayload == b"payload"
        assert parsed.deltas[1].binaryPayload == b"payload"

    def test_binary_dependency_event_applies_payload_to_all_events(self) -> None:
        listener = SettaListener(project_name="Binary Parse")
        dependency_one = create_dep_key(sectionId=ID("section-1"))
        dependency_two = create_dep_key(sectionId=ID("section-2"))
        ref = ContentRef(
            contentId="binary-2",
            byteLength=5,
            mimeType="application/octet-stream",
            sha256="binary-2-sha256",
        )
        event_one = DependencyEvent(
            dependencyKey=dependency_one,
            payload=_binary_dependency_value(ref),
            timestampMs=123,
        )
        event_two = DependencyEvent(
            dependencyKey=dependency_two,
            payload=_binary_dependency_value(ref),
            timestampMs=456,
        )
        content = ListenerDependencyEventContent(
            projectConfigId=ID("project-1"),
            dependencyEvents=[event_one, event_two],
            sequence=1,
        )
        payload = encode_binary_frame(
            {
                "messageType": ListenerMessageType.ListenerDependencyEvent.value,
                "content": content.model_dump(mode="json"),
            },
            b"payload",
        )

        parsed = listener._parse_websocket_payload(payload)

        assert isinstance(parsed, ListenerDependencyEventContent)
        assert parsed.dependencyEvents[0].binaryPayload == b"payload"
        assert parsed.dependencyEvents[1].binaryPayload == b"payload"
