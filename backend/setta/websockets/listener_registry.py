from dataclasses import dataclass, field
from typing import Iterable

from setta.code_gen.dependency_key import DependencyKey
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
)


@dataclass
class ListenerRegistration:
    websocket_id: str
    project_config_id: str
    callbacks: dict[str, ListenerRegisterCallback] = field(default_factory=dict)
    dependency_index: dict[DependencyKey, set[str]] = field(default_factory=dict)
    wildcard_callbacks: set[str] = field(default_factory=set)

    @classmethod
    def build_from_callbacks(
        cls,
        *,
        websocket_id: str,
        project_config_id: str,
        callbacks: dict[str, ListenerRegisterCallback],
    ) -> "ListenerRegistration":
        callback_map: dict[str, ListenerRegisterCallback] = dict(callbacks)
        dependency_index: dict[DependencyKey, set[str]] = {}
        wildcard_callbacks: set[str] = set()
        for callback_id, callback in callback_map.items():
            if callback.dependencyMode is ListenerDependencyMode.REFRESH_ONLY:
                continue
            if callback.dependencyMode is ListenerDependencyMode.ANY_DEPENDENCY:
                wildcard_callbacks.add(callback_id)
                continue
            if not callback.dependencies:
                wildcard_callbacks.add(callback_id)
                continue
            for dependency_key in callback.dependencies:
                dependency_index.setdefault(dependency_key, set()).add(callback_id)
        return cls(
            websocket_id=websocket_id,
            project_config_id=project_config_id,
            callbacks=callback_map,
            dependency_index=dependency_index,
            wildcard_callbacks=wildcard_callbacks,
        )


class ListenerRegistry:
    def __init__(self) -> None:
        self._registrations: dict[str, ListenerRegistration] = {}
        self._project_config_by_socket: dict[str, str] = {}

    def record_bootstrap(
        self,
        *,
        websocket_id: str,
        project_config_id: str,
    ) -> None:
        self._project_config_by_socket[websocket_id] = project_config_id

    def get_bootstrap_project_config(self, websocket_id: str) -> str | None:
        return self._project_config_by_socket.get(websocket_id)

    def upsert_registration(
        self,
        *,
        websocket_id: str,
        project_config_id: str,
        callbacks: dict[str, ListenerRegisterCallback],
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
        self._project_config_by_socket.pop(websocket_id, None)

    def get_registration(self, websocket_id: str) -> ListenerRegistration | None:
        return self._registrations.get(websocket_id)

    def iter_registrations_for_project(
        self, project_config_id: str
    ) -> Iterable[ListenerRegistration]:
        for registration in self._registrations.values():
            if registration.project_config_id == project_config_id:
                yield registration

    def iter_socket_ids_for_project(self, project_config_id: str) -> Iterable[str]:
        for websocket_id, stored_project_id in self._project_config_by_socket.items():
            if stored_project_id == project_config_id:
                yield websocket_id

    def iter_callbacks_matching_dependencies(
        self,
        *,
        project_config_id: str,
        dependency_keys: Iterable[DependencyKey],
    ) -> Iterable[tuple[ListenerRegistration, set[str]]]:
        dependency_filter = set(dependency_keys)
        for registration in self.iter_registrations_for_project(project_config_id):
            matching_callbacks: set[str] = set(registration.wildcard_callbacks)
            for dependency_key in dependency_filter:
                matching_callbacks.update(
                    registration.dependency_index.get(dependency_key, set())
                )
            if matching_callbacks:
                yield registration, matching_callbacks
