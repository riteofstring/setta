from __future__ import annotations

import unittest

from setta.types.listener import (
    ListenerDependencyKey,
    ListenerDependencyMode,
    ListenerFeed,
    ListenerRegisterCallback,
)
from setta.websockets.listener_coverage import ListenerCoverageTracker
from setta.websockets.listener_registry import ListenerRegistration


def build_registration(
    *,
    websocket_id: str,
    project_config_id: str,
    callbacks: dict[str, ListenerRegisterCallback],
) -> ListenerRegistration:
    return ListenerRegistration.build_from_callbacks(
        websocket_id=websocket_id,
        project_config_id=project_config_id,
        callbacks=callbacks,
    )


class ListenerCoverageTrackerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tracker = ListenerCoverageTracker()
        self.project_id = "proj-123"

    def test_returns_snapshot_for_new_dependencies(self):
        registration = build_registration(
            websocket_id="socket-1",
            project_config_id=self.project_id,
            callbacks={
                "cb-1": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A", codeObjId="param-1"
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                )
            },
        )

        snapshot = self.tracker.update_for_project(
            self.project_id,
            [registration],
        )

        assert snapshot is not None
        self.assertEqual(self.project_id, snapshot.projectConfigId)
        self.assertFalse(snapshot.hasRealtimeWildcard)
        self.assertEqual(
            [{"sectionId": "section-A", "codeObjId": "param-1"}],
            [dependency.model_dump() for dependency in snapshot.dependencies],
        )

    def test_returns_none_when_dependencies_unchanged(self):
        registration = build_registration(
            websocket_id="socket-1",
            project_config_id=self.project_id,
            callbacks={
                "cb-1": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A", codeObjId="param-1"
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                )
            },
        )
        first_snapshot = self.tracker.update_for_project(
            self.project_id, [registration]
        )
        assert first_snapshot is not None

        second_snapshot = self.tracker.update_for_project(
            self.project_id,
            [registration],
        )
        self.assertIsNone(second_snapshot)

    def test_emits_snapshot_when_dependencies_change(self):
        registration = build_registration(
            websocket_id="socket-1",
            project_config_id=self.project_id,
            callbacks={
                "cb-1": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A", codeObjId="param-1"
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                )
            },
        )
        second_registration = build_registration(
            websocket_id="socket-2",
            project_config_id=self.project_id,
            callbacks={
                "cb-2": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(sectionId="section-B", codeObjId=None)
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                )
            },
        )

        first_snapshot = self.tracker.update_for_project(
            self.project_id,
            [registration],
        )
        assert first_snapshot is not None

        second_snapshot = self.tracker.update_for_project(
            self.project_id,
            [registration, second_registration],
        )
        assert second_snapshot is not None
        self.assertCountEqual(
            [
                {"sectionId": "section-A", "codeObjId": "param-1"},
                {"sectionId": "section-B", "codeObjId": None},
            ],
            [dependency.model_dump() for dependency in second_snapshot.dependencies],
        )

    def test_handles_wildcard_callbacks(self):
        wildcard_registration = build_registration(
            websocket_id="socket-1",
            project_config_id=self.project_id,
            callbacks={
                "cb-1": ListenerRegisterCallback(
                    dependencies=[],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.ANY_DEPENDENCY,
                )
            },
        )

        snapshot = self.tracker.update_for_project(
            self.project_id,
            [wildcard_registration],
        )

        assert snapshot is not None
        self.assertTrue(snapshot.hasRealtimeWildcard)
        self.assertEqual([], snapshot.dependencies)

    def test_emits_reset_snapshot_when_no_registrations(self):
        registration = build_registration(
            websocket_id="socket-1",
            project_config_id=self.project_id,
            callbacks={
                "cb-1": ListenerRegisterCallback(
                    dependencies=[
                        ListenerDependencyKey(
                            sectionId="section-A", codeObjId="param-1"
                        )
                    ],
                    feed=ListenerFeed.REALTIME,
                    dependencyMode=ListenerDependencyMode.SPECIFIC,
                )
            },
        )
        first_snapshot = self.tracker.update_for_project(
            self.project_id,
            [registration],
        )
        assert first_snapshot is not None

        reset_snapshot = self.tracker.update_for_project(self.project_id, [])
        assert reset_snapshot is not None
        self.assertEqual([], reset_snapshot.dependencies)
        self.assertFalse(reset_snapshot.hasRealtimeWildcard)
