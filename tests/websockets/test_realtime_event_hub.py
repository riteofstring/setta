import unittest
from typing import cast

from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.listener import ListenerRealtimeDelta
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub
from setta.websockets.websocket_manager import WebsocketManager


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
    ) -> None:
        self.calls.append(
            {
                "projectConfigId": projectConfigId,
                "deltas": deltas,
                "sequence": sequence,
            }
        )


class RealtimeEventHubTests(unittest.IsolatedAsyncioTestCase):
    PROJECT_ID = ID("proj-1")
    SECTION_A_ID = ID("section-a")
    SECTION_B_ID = ID("section-b")

    async def test_emit_realtime_delta_increments_sequence(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(cast(WMHPythonScriptSender, sender))

        delta_a = ListenerRealtimeDelta(
            dependency=create_dep_key(sectionId=self.SECTION_A_ID),
            value=LiteralDependencyValue("1"),
        )
        delta_b = ListenerRealtimeDelta(
            dependency=create_dep_key(sectionId=self.SECTION_B_ID),
            value=LiteralDependencyValue("2"),
        )

        await hub.emit_realtime_delta(
            project_config_id=self.PROJECT_ID,
            deltas=[delta_a],
        )
        await hub.emit_realtime_delta(
            project_config_id=self.PROJECT_ID,
            deltas=[delta_b],
        )

        self.assertEqual(2, len(sender.calls))
        first = sender.calls[0]
        second = sender.calls[1]

        self.assertEqual(1, first["sequence"])
        self.assertEqual([delta_a], first["deltas"])

        self.assertEqual(2, second["sequence"])
        self.assertEqual([delta_b], second["deltas"])

    async def test_reset_sequence_starts_from_one(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(cast(WMHPythonScriptSender, sender))

        delta = ListenerRealtimeDelta(
            dependency=create_dep_key(sectionId=self.SECTION_A_ID),
            value=LiteralDependencyValue("1"),
        )

        await hub.emit_realtime_delta(
            project_config_id=self.PROJECT_ID,
            deltas=[delta],
        )
        hub.reset_sequence(self.PROJECT_ID)
        await hub.emit_realtime_delta(
            project_config_id=self.PROJECT_ID,
            deltas=[delta],
        )

        self.assertEqual(2, len(sender.calls))
        self.assertEqual(1, sender.calls[1]["sequence"])

    async def test_emit_realtime_delta_requires_dependency_ids(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(cast(WMHPythonScriptSender, sender))

        with self.assertRaises(ValueError):
            await hub.emit_realtime_delta(
                project_config_id=self.PROJECT_ID,
                deltas=[],
            )


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[object, str]] = []

    async def send_message(self, message, websocket_id):
        self.sent_messages.append((message, websocket_id))

    async def broadcast(self, message, connectionType):
        raise AssertionError("broadcast should not be used in tests")


class WMHPythonScriptSenderForceRefreshTests(unittest.IsolatedAsyncioTestCase):
    async def test_force_refresh_resets_sequence_tracking(self) -> None:
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(
            cast(WebsocketManager, websocket_manager), listener_registry
        )
        hub = RealtimeEventHub(sender)

        delta = ListenerRealtimeDelta(
            dependency=create_dep_key(sectionId=RealtimeEventHubTests.SECTION_A_ID),
            value=LiteralDependencyValue("1"),
        )

        await hub.emit_realtime_delta(
            project_config_id=RealtimeEventHubTests.PROJECT_ID,
            deltas=[delta],
        )
        self.assertIn(RealtimeEventHubTests.PROJECT_ID, hub._sequence_by_project)

        await sender.send_force_refresh(
            projectConfigId=RealtimeEventHubTests.PROJECT_ID
        )

        self.assertNotIn(RealtimeEventHubTests.PROJECT_ID, hub._sequence_by_project)
        self.assertEqual([], websocket_manager.sent_messages)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
