from typing import TYPE_CHECKING, cast

import pytest

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.listener import ListenerRealtimeDelta
from setta.websockets.realtime_event_hub import RealtimeEventHub

if TYPE_CHECKING:
    from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


pytestmark = pytest.mark.asyncio


PROJECT_ID = ID("proj-1")
SECTION_A_ID = ID("section-a")
SECTION_B_ID = ID("section-b")


class _StubPythonScriptSender:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.registered_hub = None

    def register_realtime_event_hub(self, event_hub: RealtimeEventHub) -> None:
        self.registered_hub = event_hub

    async def send_realtime_update(
        self,
        *,
        projectConfigId: ID,
        deltas: list[ListenerRealtimeDelta],
        sequence: int,
        share_session_id: str | None = None,
    ) -> None:
        self.calls.append(
            {
                "projectConfigId": projectConfigId,
                "deltas": deltas,
                "sequence": sequence,
                "share_session_id": share_session_id,
            }
        )


def _build_sender_and_hub() -> tuple[_StubPythonScriptSender, RealtimeEventHub]:
    sender = _StubPythonScriptSender()
    hub = RealtimeEventHub(cast("WMHPythonScriptSender", sender))
    return sender, hub


async def test_emit_realtime_delta_increments_sequence() -> None:
    sender, hub = _build_sender_and_hub()

    delta_a = ListenerRealtimeDelta(
        dependency=create_dep_key(sectionId=SECTION_A_ID),
        value=LiteralDependencyValue("1"),
    )
    delta_b = ListenerRealtimeDelta(
        dependency=create_dep_key(sectionId=SECTION_B_ID),
        value=LiteralDependencyValue("2"),
    )

    await hub.emit_realtime_delta(
        project_config_id=PROJECT_ID,
        deltas=[delta_a],
    )
    await hub.emit_realtime_delta(
        project_config_id=PROJECT_ID,
        deltas=[delta_b],
    )

    assert len(sender.calls) == 2
    first = sender.calls[0]
    second = sender.calls[1]

    assert first["sequence"] == 1
    assert first["deltas"] == [delta_a]

    assert second["sequence"] == 2
    assert second["deltas"] == [delta_b]


async def test_reset_sequence_starts_from_one() -> None:
    sender, hub = _build_sender_and_hub()

    delta = ListenerRealtimeDelta(
        dependency=create_dep_key(sectionId=SECTION_A_ID),
        value=LiteralDependencyValue("1"),
    )

    await hub.emit_realtime_delta(
        project_config_id=PROJECT_ID,
        deltas=[delta],
    )
    hub.reset_sequence(PROJECT_ID)
    await hub.emit_realtime_delta(
        project_config_id=PROJECT_ID,
        deltas=[delta],
    )

    assert len(sender.calls) == 2
    assert sender.calls[1]["sequence"] == 1


async def test_emit_realtime_delta_requires_dependency_ids() -> None:
    _, hub = _build_sender_and_hub()

    with pytest.raises(ValueError):
        await hub.emit_realtime_delta(
            project_config_id=PROJECT_ID,
            deltas=[],
        )
