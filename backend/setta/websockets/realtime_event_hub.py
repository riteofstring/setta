from setta.types.id import ID
from setta.types.listener import ControlActionEvent, ListenerRealtimeDelta
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class RealtimeEventHub:
    """Coordinates realtime listener deltas and per-project sequencing."""

    def __init__(self, python_script_sender: WMHPythonScriptSender) -> None:
        self._python_script_sender = python_script_sender
        self._sequence_by_project: dict[str, int] = {}
        python_script_sender.register_realtime_event_hub(self)

    def reset_sequence(self, project_config_id: ID) -> None:
        """Reset the realtime sequence counter for a project.

        Call this when a listener receives a full snapshot (bootstrap or force refresh)
        so the next realtime delta starts from sequence 1 again.
        """
        self._sequence_by_project.pop(project_config_id, None)

    async def emit_realtime_delta(
        self,
        *,
        project_config_id: ID,
        deltas: list[ListenerRealtimeDelta],
    ) -> None:
        if not deltas:
            raise ValueError("deltas must contain at least one entry")
        sequence = self._sequence_by_project.get(project_config_id, 0) + 1
        self._sequence_by_project[project_config_id] = sequence
        await self._python_script_sender.send_realtime_update(
            projectConfigId=project_config_id,
            deltas=deltas,
            sequence=sequence,
        )

    async def emit_action_event(
        self,
        *,
        project_config_id: ID,
        action_events: list[ControlActionEvent],
    ) -> None:
        if not action_events:
            raise ValueError("action_events must contain at least one entry")
        sequence = self._sequence_by_project.get(project_config_id, 0) + 1
        self._sequence_by_project[project_config_id] = sequence
        await self._python_script_sender.send_action_event(
            projectConfigId=project_config_id,
            actionEvents=action_events,
            sequence=sequence,
        )
