from setta.types.id import ID
from setta.types.listener import DependencyEvent, ListenerRealtimeDelta
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class RealtimeEventHub:
    """Coordinates realtime listener deltas and per-project sequencing."""

    def __init__(self, python_script_sender: WMHPythonScriptSender) -> None:
        self._python_script_sender = python_script_sender
        self._sequence_by_project: dict[tuple[ID, str | None], int] = {}

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

    async def emit_realtime_delta_binary(
        self,
        *,
        project_config_id: ID,
        delta: ListenerRealtimeDelta,
        binary_payload: bytes,
        share_session_id: str | None = None,
    ) -> None:
        await self.emit_realtime_deltas_binary(
            project_config_id=project_config_id,
            deltas=[delta],
            binary_payload=binary_payload,
            share_session_id=share_session_id,
        )

    async def emit_realtime_deltas_binary(
        self,
        *,
        project_config_id: ID,
        deltas: list[ListenerRealtimeDelta],
        binary_payload: bytes,
        share_session_id: str | None = None,
    ) -> None:
        if not deltas:
            raise ValueError("deltas must contain at least one entry")
        sequence_key = (project_config_id, share_session_id)
        sequence = self._sequence_by_project.get(sequence_key, 0) + 1
        self._sequence_by_project[sequence_key] = sequence
        await self._python_script_sender.send_realtime_updates_binary(
            projectConfigId=project_config_id,
            deltas=deltas,
            binary_payload=binary_payload,
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
        sequence_key = (project_config_id, share_session_id)
        sequence = self._sequence_by_project.get(sequence_key, 0) + 1
        self._sequence_by_project[sequence_key] = sequence
        await self._python_script_sender.send_dependency_event(
            projectConfigId=project_config_id,
            dependencyEvents=dependency_events,
            sequence=sequence,
            share_session_id=share_session_id,
        )

    async def emit_dependency_event_binary(
        self,
        *,
        project_config_id: ID,
        dependency_event: DependencyEvent,
        binary_payload: bytes,
        share_session_id: str | None = None,
    ) -> None:
        sequence_key = (project_config_id, share_session_id)
        sequence = self._sequence_by_project.get(sequence_key, 0) + 1
        self._sequence_by_project[sequence_key] = sequence
        await self._python_script_sender.send_dependency_event_binary(
            projectConfigId=project_config_id,
            dependencyEvent=dependency_event,
            binary_payload=binary_payload,
            sequence=sequence,
            share_session_id=share_session_id,
        )
