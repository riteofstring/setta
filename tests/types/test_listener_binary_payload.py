from setta.types.id import ID
from setta.types.listener import DependencyEvent, ListenerRealtimeDelta
from setta.types.protocol import LiteralDependencyValue, create_dep_key


def test_dependency_event_binary_payload_is_private() -> None:
    dependency_key = create_dep_key(sectionId=ID("section-1"))
    event = DependencyEvent(
        dependencyKey=dependency_key,
        payload=LiteralDependencyValue(payload="hello"),
        timestampMs=123,
    )
    event.binaryPayload = b"payload"

    assert event.binaryPayload == b"payload"
    dumped = event.model_dump()
    assert "binaryPayload" not in dumped


def test_realtime_delta_binary_payload_is_private() -> None:
    dependency_key = create_dep_key(sectionId=ID("section-1"))
    delta = ListenerRealtimeDelta(
        dependency=dependency_key,
        value=LiteralDependencyValue(payload="update"),
    )
    delta.binaryPayload = b"delta-bytes"

    assert delta.binaryPayload == b"delta-bytes"
    dumped = delta.model_dump()
    assert "binaryPayload" not in dumped
