import unittest

from setta.websockets.realtime_event_hub import RealtimeEventHub


class _StubPythonScriptSender:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def send_realtime_update(
        self,
        *,
        projectConfigId: str,
        delta: dict[str, object],
        sequence: int,
        metadata: dict[str, object] | None = None,
    ) -> None:
        self.calls.append(
            {
                "projectConfigId": projectConfigId,
                "delta": delta,
                "sequence": sequence,
                "metadata": metadata,
            }
        )


class RealtimeEventHubTests(unittest.IsolatedAsyncioTestCase):
    async def test_emit_realtime_delta_increments_sequence(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(sender)

        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            delta={"dep-a": 1},
            metadata={"source": "slider"},
        )
        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            delta={"dep-b": 2},
        )

        self.assertEqual(2, len(sender.calls))
        first = sender.calls[0]
        second = sender.calls[1]

        self.assertEqual(1, first["sequence"])
        self.assertEqual({"dep-a": 1}, first["delta"])
        self.assertEqual({"source": "slider"}, first["metadata"])

        self.assertEqual(2, second["sequence"])
        self.assertEqual({"dep-b": 2}, second["delta"])
        self.assertIsNone(second["metadata"])

    async def test_reset_sequence_starts_from_one(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(sender)

        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            delta={"dep-a": 1},
        )
        hub.reset_sequence("proj-1")
        await hub.emit_realtime_delta(
            project_config_id="proj-1",
            delta={"dep-a": 2},
        )

        self.assertEqual(2, len(sender.calls))
        self.assertEqual(1, sender.calls[1]["sequence"])

    async def test_emit_realtime_delta_requires_dependency_ids(self) -> None:
        sender = _StubPythonScriptSender()
        hub = RealtimeEventHub(sender)

        with self.assertRaises(ValueError):
            await hub.emit_realtime_delta(
                project_config_id="proj-1",
                delta={},
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
