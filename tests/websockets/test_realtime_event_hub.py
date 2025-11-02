import unittest

from setta.types.listener import ListenerDependencyKey, ListenerRealtimeDelta
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.realtime_event_hub import RealtimeEventHub


class _StubPythonScriptSender:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.registered_hub = None

    def register_realtime_event_hub(self, event_hub: RealtimeEventHub) -> None:
        self.registered_hub = event_hub

    async def send_realtime_update(
        self,
        *,
        projectConfigId: str,
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
    async def test_emit_realtime_delta_increments_sequence(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(sender)

        delta_a = ListenerRealtimeDelta(
            dependency=ListenerDependencyKey(sectionId="section-a", codeObjId=None),
            value=1,
        )
        delta_b = ListenerRealtimeDelta(
            dependency=ListenerDependencyKey(sectionId="section-b", codeObjId=None),
            value=2,
        )

        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            deltas=[delta_a],
        )
        await hub.emit_realtime_delta(
            project_config_id="proj-1",
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
        hub = RealtimeEventHub(sender)

        delta = ListenerRealtimeDelta(
            dependency=ListenerDependencyKey(sectionId="section-a", codeObjId=None),
            value=1,
        )

        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            deltas=[delta],
        )
        hub.reset_sequence("proj-1")
        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            deltas=[delta],
        )

        self.assertEqual(2, len(sender.calls))
        self.assertEqual(1, sender.calls[1]["sequence"])

    async def test_emit_realtime_delta_requires_dependency_ids(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(sender)

        with self.assertRaises(ValueError):
            await hub.emit_realtime_delta(
                project_config_id="proj-1",
                deltas=[],
            )


class _StubWebsocketManager:
    def __init__(self) -> None:
        self.broadcasts: list[dict[str, object]] = []

    async def send_message(self, message, websocket_id):
        pass

    async def broadcast(self, message, connectionType):
        self.broadcasts.append({"message": message, "connectionType": connectionType})


class WMHPythonScriptSenderForceRefreshTests(unittest.IsolatedAsyncioTestCase):
    async def test_force_refresh_resets_sequence_tracking(self) -> None:
        websocket_manager = _StubWebsocketManager()
        listener_registry = ListenerRegistry()
        sender = WMHPythonScriptSender(websocket_manager, listener_registry)
        hub = RealtimeEventHub(sender)

        delta = ListenerRealtimeDelta(
            dependency=ListenerDependencyKey(sectionId="section-a", codeObjId=None),
            value=1,
        )

        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            deltas=[delta],
        )
        self.assertIn("proj-1", hub._sequence_by_project)

        await sender.send_force_refresh(projectConfigId="proj-1")

        self.assertNotIn("proj-1", hub._sequence_by_project)
        self.assertEqual(1, len(websocket_manager.broadcasts))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
