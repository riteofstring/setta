from dataclasses import dataclass, field
from typing import Iterable

from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
)


@dataclass
class ListenerRegistration:
    websocket_id: str
    project_config_id: ID
    use_temporary_ids: bool = False
    share_session_id: str | None = None
    callbacks: dict[str, ListenerRegisterCallback] = field(default_factory=dict)
    dependency_index: dict[BaseDependencyKeyUnion, set[str]] = field(
        default_factory=dict
    )
    action_index: dict[str, set[str]] = field(default_factory=dict)
    action_wildcard_callbacks: set[str] = field(default_factory=set)
    wildcard_callbacks: set[str] = field(default_factory=set)

    @classmethod
    def build_from_callbacks(
        cls,
        *,
        websocket_id: str,
        project_config_id: ID,
        callbacks: dict[str, ListenerRegisterCallback],
        use_temporary_ids: bool = False,
        share_session_id: str | None = None,
    ) -> "ListenerRegistration":
        callback_map: dict[str, ListenerRegisterCallback] = dict(callbacks)
        dependency_index: dict[BaseDependencyKeyUnion, set[str]] = {}
        action_index: dict[str, set[str]] = {}
        action_wildcard_callbacks: set[str] = set()
        wildcard_callbacks: set[str] = set()
        for callback_id, callback in callback_map.items():
            if callback.actions is not None:
                if not callback.actions:
                    action_wildcard_callbacks.add(callback_id)
                else:
                    for action_id in callback.actions:
                        action_index.setdefault(action_id, set()).add(callback_id)
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
            use_temporary_ids=use_temporary_ids,
            share_session_id=share_session_id,
            callbacks=callback_map,
            dependency_index=dependency_index,
            action_index=action_index,
            action_wildcard_callbacks=action_wildcard_callbacks,
            wildcard_callbacks=wildcard_callbacks,
        )


class ListenerRegistry:
    def __init__(self) -> None:
        self._registrations: dict[str, ListenerRegistration] = {}
        self._project_config_by_socket: dict[str, ID] = {}
        self._use_temporary_ids_by_socket: dict[str, bool] = {}
        self._share_session_by_socket: dict[str, str | None] = {}

    def record_bootstrap(
        self,
        *,
        websocket_id: str,
        project_config_id: ID,
        use_temporary_ids: bool = False,
        share_session_id: str | None = None,
    ) -> None:
        self._project_config_by_socket[websocket_id] = project_config_id
        self._use_temporary_ids_by_socket[websocket_id] = use_temporary_ids
        self._share_session_by_socket[websocket_id] = share_session_id

    def get_bootstrap_project_config(self, websocket_id: str) -> ID | None:
        return self._project_config_by_socket.get(websocket_id)

    def get_bootstrap_share_session_id(self, websocket_id: str) -> str | None:
        return self._share_session_by_socket.get(websocket_id)

    def upsert_registration(
        self,
        *,
        websocket_id: str,
        project_config_id: ID,
        callbacks: dict[str, ListenerRegisterCallback],
        use_temporary_ids: bool | None = None,
        share_session_id: str | None = None,
    ) -> ListenerRegistration:
        if use_temporary_ids is None:
            use_temporary_ids = self._use_temporary_ids_by_socket.get(
                websocket_id, False
            )
        if share_session_id is None:
            share_session_id = self._share_session_by_socket.get(websocket_id)
        registration = ListenerRegistration.build_from_callbacks(
            websocket_id=websocket_id,
            project_config_id=project_config_id,
            callbacks=callbacks,
            use_temporary_ids=use_temporary_ids,
            share_session_id=share_session_id,
        )
        self._registrations[websocket_id] = registration
        self._use_temporary_ids_by_socket[websocket_id] = use_temporary_ids
        self._share_session_by_socket[websocket_id] = share_session_id
        return registration

    def remove_registration(self, websocket_id: str) -> None:
        self._registrations.pop(websocket_id, None)
        self._project_config_by_socket.pop(websocket_id, None)
        self._use_temporary_ids_by_socket.pop(websocket_id, None)
        self._share_session_by_socket.pop(websocket_id, None)

    def get_registration(self, websocket_id: str) -> ListenerRegistration | None:
        return self._registrations.get(websocket_id)

    def use_temporary_ids_for_socket(self, websocket_id: str) -> bool:
        return self._use_temporary_ids_by_socket.get(websocket_id, False)

    def iter_registrations_for_project(
        self,
        project_config_id: ID,
        share_session_id: str | None = None,
    ) -> Iterable[ListenerRegistration]:
        for registration in self._registrations.values():
            if registration.project_config_id == project_config_id:
                if share_session_id is None:
                    yield registration
                    continue
                if (
                    registration.share_session_id is None
                    or registration.share_session_id == share_session_id
                ):
                    yield registration

    def iter_socket_ids_for_project(
        self,
        project_config_id: ID,
        share_session_id: str | None = None,
    ) -> Iterable[str]:
        for websocket_id, stored_project_id in self._project_config_by_socket.items():
            if stored_project_id == project_config_id:
                if share_session_id is None:
                    yield websocket_id
                    continue
                stored_session_id = self._share_session_by_socket.get(websocket_id)
                if stored_session_id is None or stored_session_id == share_session_id:
                    yield websocket_id

    def iter_callbacks_matching_dependencies(
        self,
        *,
        project_config_id: ID,
        dependency_keys: Iterable[BaseDependencyKeyUnion],
        share_session_id: str | None = None,
    ) -> Iterable[tuple[ListenerRegistration, set[str]]]:
        dependency_filter = set(dependency_keys)
        for registration in self.iter_registrations_for_project(
            project_config_id,
            share_session_id=share_session_id,
        ):
            matching_callbacks: set[str] = set(registration.wildcard_callbacks)
            for dependency_key in dependency_filter:
                matching_callbacks.update(
                    registration.dependency_index.get(dependency_key, set())
                )
            if matching_callbacks:
                yield registration, matching_callbacks

    def iter_callbacks_matching_actions(
        self,
        *,
        project_config_id: ID,
        action_ids: Iterable[str],
        share_session_id: str | None = None,
    ) -> Iterable[tuple[ListenerRegistration, set[str]]]:
        action_filter = set(action_ids)
        for registration in self.iter_registrations_for_project(
            project_config_id,
            share_session_id=share_session_id,
        ):
            matching_callbacks: set[str] = set(registration.action_wildcard_callbacks)
            for action_id in action_filter:
                matching_callbacks.update(
                    registration.action_index.get(action_id, set())
                )
            if matching_callbacks:
                yield registration, matching_callbacks
