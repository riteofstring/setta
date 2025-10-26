from dataclasses import dataclass, field
from typing import Iterable, Mapping

from setta.types.listener import ListenerRegisterCallback


@dataclass
class ListenerRegistration:
    websocket_id: str
    project_config_id: str
    callbacks: dict[str, ListenerRegisterCallback] = field(default_factory=dict)

    @classmethod
    def build_from_callbacks(
        cls,
        *,
        websocket_id: str,
        project_config_id: str,
        callbacks: Mapping[str, ListenerRegisterCallback],
    ) -> "ListenerRegistration":
        callback_map: dict[str, ListenerRegisterCallback] = dict(callbacks)
        return cls(
            websocket_id=websocket_id,
            project_config_id=project_config_id,
            callbacks=callback_map,
        )


class ListenerRegistry:
    def __init__(self) -> None:
        self._registrations: dict[str, ListenerRegistration] = {}

    def upsert_registration(
        self,
        *,
        websocket_id: str,
        project_config_id: str,
        callbacks: Mapping[str, ListenerRegisterCallback],
    ) -> ListenerRegistration:
        registration = ListenerRegistration.build_from_callbacks(
            websocket_id=websocket_id,
            project_config_id=project_config_id,
            callbacks=callbacks,
        )
        self._registrations[websocket_id] = registration
        return registration

    def remove_registration(self, websocket_id: str) -> None:
        self._registrations.pop(websocket_id, None)

    def get_registration(self, websocket_id: str) -> ListenerRegistration | None:
        return self._registrations.get(websocket_id)

    def iter_registrations_for_project(
        self, project_config_id: str
    ) -> Iterable[ListenerRegistration]:
        for registration in self._registrations.values():
            if registration.project_config_id == project_config_id:
                yield registration
