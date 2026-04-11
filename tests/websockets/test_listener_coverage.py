import pytest

from setta.types.dependency_key import create_dep_key
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyMode,
    ListenerRegisterCallback,
)
from setta.websockets.listener_coverage import ListenerCoverageTracker
from setta.websockets.listener_registry import ListenerRegistration


def build_registration(
    *,
    websocket_id: str,
    project_config_id: ID,
    callbacks: dict[str, ListenerRegisterCallback],
) -> ListenerRegistration:
    return ListenerRegistration.build_from_callbacks(
        websocket_id=websocket_id,
        project_config_id=project_config_id,
        callbacks=callbacks,
    )


@pytest.fixture
def tracker_env():
    return ListenerCoverageTracker(), ID("proj-123")


def _signature(dependency):
    return (dependency.sectionId, getattr(dependency, "codeObjId", None))


def test_returns_snapshot_for_new_dependencies(tracker_env) -> None:
    tracker, project_config_id = tracker_env
    registration = build_registration(
        websocket_id="socket-1",
        project_config_id=project_config_id,
        callbacks={
            "cb-1": ListenerRegisterCallback(
                dependencies=[
                    create_dep_key(
                        sectionId=ID("section-A"), codeObjId=ID("param-1")
                    )
                ],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )

    snapshot = tracker.update_for_project(
        project_config_id,
        [registration],
    )

    assert snapshot is not None
    assert project_config_id == snapshot.projectConfigId
    assert snapshot.hasRealtimeWildcard is False
    assert [("section-A", "param-1")] == [
        _signature(dependency) for dependency in snapshot.dependencies
    ]


def test_returns_none_when_dependencies_unchanged(tracker_env) -> None:
    tracker, project_config_id = tracker_env
    registration = build_registration(
        websocket_id="socket-1",
        project_config_id=project_config_id,
        callbacks={
            "cb-1": ListenerRegisterCallback(
                dependencies=[
                    create_dep_key(
                        sectionId=ID("section-A"), codeObjId=ID("param-1")
                    )
                ],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )
    first_snapshot = tracker.update_for_project(project_config_id, [registration])
    assert first_snapshot is not None

    second_snapshot = tracker.update_for_project(
        project_config_id,
        [registration],
    )
    assert second_snapshot is None


def test_emits_snapshot_when_dependencies_change(tracker_env) -> None:
    tracker, project_config_id = tracker_env
    registration = build_registration(
        websocket_id="socket-1",
        project_config_id=project_config_id,
        callbacks={
            "cb-1": ListenerRegisterCallback(
                dependencies=[
                    create_dep_key(
                        sectionId=ID("section-A"), codeObjId=ID("param-1")
                    )
                ],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )
    second_registration = build_registration(
        websocket_id="socket-2",
        project_config_id=project_config_id,
        callbacks={
            "cb-2": ListenerRegisterCallback(
                dependencies=[
                    create_dep_key(sectionId=ID("section-B"), codeObjId=None)
                ],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )

    first_snapshot = tracker.update_for_project(
        project_config_id,
        [registration],
    )
    assert first_snapshot is not None

    second_snapshot = tracker.update_for_project(
        project_config_id,
        [registration, second_registration],
    )
    assert second_snapshot is not None
    assert sorted(
        [
            ("section-A", "param-1"),
            ("section-B", None),
        ]
    ) == sorted(
        [_signature(dependency) for dependency in second_snapshot.dependencies]
    )


def test_handles_wildcard_callbacks(tracker_env) -> None:
    tracker, project_config_id = tracker_env
    wildcard_registration = build_registration(
        websocket_id="socket-1",
        project_config_id=project_config_id,
        callbacks={
            "cb-1": ListenerRegisterCallback(
                dependencies=[],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )

    snapshot = tracker.update_for_project(
        project_config_id,
        [wildcard_registration],
    )

    assert snapshot is not None
    assert snapshot.hasRealtimeWildcard is True
    assert snapshot.dependencies == []


def test_emits_reset_snapshot_when_no_registrations(tracker_env) -> None:
    tracker, project_config_id = tracker_env
    registration = build_registration(
        websocket_id="socket-1",
        project_config_id=project_config_id,
        callbacks={
            "cb-1": ListenerRegisterCallback(
                dependencies=[
                    create_dep_key(
                        sectionId=ID("section-A"), codeObjId=ID("param-1")
                    )
                ],
                dependencyMode=ListenerDependencyMode.ALWAYS,
            )
        },
    )
    first_snapshot = tracker.update_for_project(
        project_config_id,
        [registration],
    )
    assert first_snapshot is not None

    reset_snapshot = tracker.update_for_project(project_config_id, [])
    assert reset_snapshot is not None
    assert reset_snapshot.dependencies == []
    assert reset_snapshot.hasRealtimeWildcard is False
