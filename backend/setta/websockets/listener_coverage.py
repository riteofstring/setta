from dataclasses import dataclass
from typing import Iterable

from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.id import ID
from setta.types.listener import (
    DependencyEventType,
    ListenerCoverageSnapshot,
    ListenerDependencyMode,
)
from setta.websockets.listener_registry import ListenerRegistration


@dataclass(frozen=True)
class _CoverageSignature:
    dependency_keys: frozenset[BaseDependencyKeyUnion]
    has_realtime_wildcard: bool


@dataclass
class _CoverageState:
    signature: _CoverageSignature
    snapshot: ListenerCoverageSnapshot


class ListenerCoverageTracker:
    def __init__(self) -> None:
        self._state_by_key: dict[tuple[str, str | None], _CoverageState] = {}

    @staticmethod
    def _coverage_key(
        project_config_id: ID, share_session_id: str | None
    ) -> tuple[str, str | None]:
        return (str(project_config_id), share_session_id)

    def _build_signature_and_snapshot(
        self,
        project_config_id: ID,
        registrations: Iterable[ListenerRegistration],
    ) -> tuple[_CoverageSignature, ListenerCoverageSnapshot]:
        dependency_keys: set[BaseDependencyKeyUnion] = set()
        has_realtime_wildcard = False

        for registration in registrations:
            for callback in registration.callbacks.values():
                if DependencyEventType.VALUE not in callback.eventTypes:
                    continue
                if callback.dependencyMode is ListenerDependencyMode.REFRESH_ONLY:
                    continue
                if callback.dependencyMode is ListenerDependencyMode.ANY_DEPENDENCY:
                    has_realtime_wildcard = True
                    continue
                if not callback.dependencies:
                    continue
                dependency_keys.update(d for d in callback.dependencies)

        signature = _CoverageSignature(
            dependency_keys=frozenset(dependency_keys),
            has_realtime_wildcard=has_realtime_wildcard,
        )

        snapshot = ListenerCoverageSnapshot(
            projectConfigId=project_config_id,
            dependencies=list(dependency_keys),
            hasRealtimeWildcard=signature.has_realtime_wildcard,
        )

        return signature, snapshot

    def update_for_project(
        self,
        project_config_id: ID,
        registrations: Iterable[ListenerRegistration],
        *,
        share_session_id: str | None = None,
    ) -> ListenerCoverageSnapshot | None:
        signature, snapshot = self._build_signature_and_snapshot(
            project_config_id,
            registrations,
        )

        key = self._coverage_key(project_config_id, share_session_id)
        prev_state = self._state_by_key.get(key)
        if prev_state and prev_state.signature == signature:
            return None

        self._state_by_key[key] = _CoverageState(
            signature=signature,
            snapshot=snapshot,
        )
        return snapshot

    def get_snapshot_for_project(
        self,
        project_config_id: ID,
        registrations: Iterable[ListenerRegistration],
        *,
        share_session_id: str | None = None,
    ) -> ListenerCoverageSnapshot:
        signature, snapshot = self._build_signature_and_snapshot(
            project_config_id,
            registrations,
        )

        key = self._coverage_key(project_config_id, share_session_id)
        prev_state = self._state_by_key.get(key)
        if prev_state and prev_state.signature == signature:
            return prev_state.snapshot

        self._state_by_key[key] = _CoverageState(
            signature=signature,
            snapshot=snapshot,
        )
        return snapshot
