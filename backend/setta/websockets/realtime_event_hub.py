from setta.types.id import ID
from setta.types.listener import (
    DependencyEvent,
    DependencyEventType,
    ListenerRealtimeDelta,
)
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class RealtimeEventHub:
    """Coordinates realtime listener deltas and per-project sequencing."""

    def __init__(self, python_script_sender: WMHPythonScriptSender) -> None:
        self._python_script_sender = python_script_sender
        self._sequence_by_project: dict[tuple[ID, str | None], int] = {}
        python_script_sender.register_realtime_event_hub(self)

    def reset_sequence(
        self,
        project_config_id: ID,
        share_session_id: str | None = None,
    ) -> None:
        """Reset the realtime sequence counter for a project.

        Call this when a listener receives a full snapshot (bootstrap or force refresh)
        so the next realtime delta starts from sequence 1 again.
        """
        self._sequence_by_project.pop((project_config_id, share_session_id), None)

    def drop_share_session_sequences(self, share_session_id: str) -> None:
        if not self._sequence_by_project:
            return
        keys_to_drop = [
            key
            for key in self._sequence_by_project.keys()
            if key[1] == share_session_id
        ]
        for key in keys_to_drop:
            del self._sequence_by_project[key]

    async def emit_realtime_delta(
        self,
        *,
        project_config_id: ID,
        deltas: list[ListenerRealtimeDelta],
        share_session_id: str | None = None,
    ) -> None:
        if not deltas:
            raise ValueError("deltas must contain at least one entry")
        sequence_key = (project_config_id, share_session_id)
        sequence = self._sequence_by_project.get(sequence_key, 0) + 1
        self._sequence_by_project[sequence_key] = sequence
        await self._python_script_sender.send_realtime_update(
            projectConfigId=project_config_id,
            deltas=deltas,
            sequence=sequence,
            share_session_id=share_session_id,
        )

    async def emit_dependency_event(
        self,
        *,
        project_config_id: ID,
        dependency_events: list[DependencyEvent],
        share_session_id: str | None = None,
    ) -> None:
        if not dependency_events:
            raise ValueError("dependency_events must contain at least one entry")
        if any(
            event.eventType is not DependencyEventType.ACTION
            for event in dependency_events
        ):
            raise ValueError("dependency_events must be action events")
        sequence_key = (project_config_id, share_session_id)
        sequence = self._sequence_by_project.get(sequence_key, 0) + 1
        self._sequence_by_project[sequence_key] = sequence
        await self._python_script_sender.send_dependency_event(
            projectConfigId=project_config_id,
            dependencyEvents=dependency_events,
            sequence=sequence,
            share_session_id=share_session_id,
        )
