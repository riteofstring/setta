from dataclasses import dataclass
from typing import Iterable

from setta.code_gen.dependency_graph import GraphKeyType
from setta.types.listener import (
    ListenerCoverageSnapshot,
    ListenerDependencyKey,
    ListenerFeed,
)
from setta.websockets.listener_registry import ListenerRegistration


@dataclass(frozen=True)
class _CoverageSignature:
    dependency_keys: frozenset[GraphKeyType]
    has_realtime_wildcard: bool


@dataclass
class _CoverageState:
    signature: _CoverageSignature
    snapshot: ListenerCoverageSnapshot


class ListenerCoverageTracker:
    def __init__(self) -> None:
        self._state_by_project: dict[str, _CoverageState] = {}

    def _build_signature_and_snapshot(
        self,
        project_config_id: str,
        registrations: Iterable[ListenerRegistration],
    ) -> tuple[_CoverageSignature, ListenerCoverageSnapshot]:
        dependency_keys: set[GraphKeyType] = set()
        has_realtime_wildcard = False

        for registration in registrations:
            for callback in registration.callbacks.values():
                if callback.feed not in (ListenerFeed.REALTIME, ListenerFeed.BOTH):
                    continue
                if not callback.dependencies:
                    has_realtime_wildcard = True
                    continue
                for dependency in callback.dependencies:
                    dependency_keys.add(dependency.to_graph_key())

        signature = _CoverageSignature(
            dependency_keys=frozenset(dependency_keys),
            has_realtime_wildcard=has_realtime_wildcard,
        )

        serialized_dependencies = [
            ListenerDependencyKey.from_graph_key(graph_key)
            for graph_key in signature.dependency_keys
        ]

        snapshot = ListenerCoverageSnapshot(
            projectConfigId=project_config_id,
            dependencies=serialized_dependencies,
            hasRealtimeWildcard=signature.has_realtime_wildcard,
        )

        return signature, snapshot

    def update_for_project(
        self,
        project_config_id: str,
        registrations: Iterable[ListenerRegistration],
    ) -> ListenerCoverageSnapshot | None:
        signature, snapshot = self._build_signature_and_snapshot(
            project_config_id,
            registrations,
        )

        prev_state = self._state_by_project.get(project_config_id)
        if prev_state and prev_state.signature == signature:
            return None

        self._state_by_project[project_config_id] = _CoverageState(
            signature=signature,
            snapshot=snapshot,
        )
        return snapshot

    def get_snapshot_for_project(
        self,
        project_config_id: str,
        registrations: Iterable[ListenerRegistration],
    ) -> ListenerCoverageSnapshot:
        signature, snapshot = self._build_signature_and_snapshot(
            project_config_id,
            registrations,
        )

        prev_state = self._state_by_project.get(project_config_id)
        if prev_state and prev_state.signature == signature:
            return prev_state.snapshot

        self._state_by_project[project_config_id] = _CoverageState(
            signature=signature,
            snapshot=snapshot,
        )
        return snapshot
