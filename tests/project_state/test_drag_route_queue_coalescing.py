import asyncio
import time
from dataclasses import dataclass
from typing import cast

import pytest
from setta.project_state.project_manager_types import (
    SetBrowserColumnWidthsRequest,
    SetSectionColumnWidthRequest,
    SetSectionSizesRequest,
    SetTopLevelSectionLayoutRequest,
    SetViewportRequest,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.id import ID
from setta.types.project_config import Position, TopLevelSectionLayout, Viewport
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BrowserSectionImpl, CallableSectionImpl, SectionSize, SectionType

from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@dataclass(frozen=True)
class _DragRouteSectionIds:
    callable_section_id: ID
    callable_section_id_2: ID
    browser_section_id: ID


def _build_drag_route_project_state() -> tuple[ProjectStateSingleConfig, _DragRouteSectionIds]:
    settings = SettingsState()
    project_state = build_callable_project_state(12)
    callable_section_id = ID("section-1")
    callable_section_id_2 = create_top_level_section(
        settings,
        project_state,
        SectionType.Callable,
        Position(x=900.0, y=0.0),
        core_overrides={"name": "queue_coalesce_callable_2"},
    )
    browser_section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Browser,
        Position(x=1020.0, y=80.0),
        core_overrides={"name": "queue_coalesce_browser"},
    )
    return project_state, _DragRouteSectionIds(
        callable_section_id=callable_section_id,
        callable_section_id_2=callable_section_id_2,
        browser_section_id=browser_section_id,
    )


async def _wait_for_pending_frontend_ops_at_least(
    manager, size: int, timeout_s: float
) -> None:
    start = time.monotonic()
    while len(manager.pending_frontend_ops) < size:
        if time.monotonic() - start > timeout_s:
            pytest.fail(f"Expected pending frontend ops to reach at least {size}.")
        await asyncio.sleep(0)


def _get_handler_call_count(manager, handler_name: str) -> int:
    snapshot = manager.get_queue_timing_metrics_snapshot()
    by_handler = cast("dict[str, object]", snapshot["byHandler"])
    handler_metrics = cast("dict[str, object]", by_handler[handler_name])
    return cast("int", handler_metrics["calls"])


def _set_op_ids(completed_op_ids_by_patch: list[list[str]]) -> set[str]:
    return {op_id for ids in completed_op_ids_by_patch for op_id in ids}


@pytest.mark.asyncio
async def test_set_top_level_section_layout_coalesces_same_key_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        project_state_before = manager.get_single_config_state(project_config_id)
        base_layouts = dict(project_state_before.projectConfig.topLevelSections)
        target_section_id = section_ids.callable_section_id

        blocker_started = asyncio.Event()
        blocker_release = asyncio.Event()

        async def blocker() -> None:
            blocker_started.set()
            await blocker_release.wait()

        blocker_task = asyncio.create_task(manager._enqueue(blocker()))
        await blocker_started.wait()

        manager.reset_queue_timing_metrics()

        def build_layouts(x: float, y: float) -> dict[ID, TopLevelSectionLayout]:
            next_layouts = dict(base_layouts)
            next_layouts[target_section_id] = TopLevelSectionLayout(x=x, y=y)
            return next_layouts

        task_1 = asyncio.create_task(
            manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=build_layouts(220.0, 180.0),
                    frontendOpId="top-level-layout-1",
                )
            )
        )
        task_2 = asyncio.create_task(
            manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=build_layouts(350.0, 260.0),
                    frontendOpId="top-level-layout-2",
                )
            )
        )
        task_3 = asyncio.create_task(
            manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=build_layouts(480.0, 320.0),
                    frontendOpId="top-level-layout-3",
                )
            )
        )

        await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

        blocker_release.set()
        await blocker_task
        await asyncio.gather(task_1, task_2, task_3)
        await manager.finish_pending_operations(timeout=5.0)

        project_state_after = manager.get_single_config_state(project_config_id)
        top_level_layout = project_state_after.projectConfig.topLevelSections[
            target_section_id
        ]
        assert top_level_layout.x == 480.0
        assert top_level_layout.y == 320.0

        active_view_mode_id = project_state_after.projectConfig.activeViewModeId
        if active_view_mode_id is None:
            raise KeyError("Active view mode is not set")
        view_mode = project_state_after.projectConfig.viewModes.get(active_view_mode_id)
        if view_mode is None:
            raise KeyError(f"View mode {active_view_mode_id} not found")
        view_mode_layout = view_mode.topLevelSections[target_section_id]
        assert view_mode_layout.x == 480.0
        assert view_mode_layout.y == 320.0
        assert _get_handler_call_count(manager, "set_top_level_section_layout") == 1


@pytest.mark.asyncio
async def test_set_section_sizes_coalesces_same_key_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        completed_op_ids_by_patch: list[list[str]] = []
        original_section_patch = sender.broadcast_project_state_section_impl_patch

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            completed_op_ids_by_patch.append(list(completed_op_ids))
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        try:
            blocker_started = asyncio.Event()
            blocker_release = asyncio.Event()

            async def blocker() -> None:
                blocker_started.set()
                await blocker_release.wait()

            blocker_task = asyncio.create_task(manager._enqueue(blocker()))
            await blocker_started.wait()

            manager.reset_queue_timing_metrics()
            task_1 = asyncio.create_task(
                manager.set_section_sizes(
                    SetSectionSizesRequest(
                        projectConfigId=project_config_id,
                        sectionSizes={
                            section_ids.callable_section_id: SectionSize(
                                width=640.0,
                                height=440.0,
                            )
                        },
                        frontendOpId="section-sizes-1",
                    )
                )
            )
            task_2 = asyncio.create_task(
                manager.set_section_sizes(
                    SetSectionSizesRequest(
                        projectConfigId=project_config_id,
                        sectionSizes={
                            section_ids.callable_section_id: SectionSize(
                                width=700.0,
                                height=470.0,
                            )
                        },
                        frontendOpId="section-sizes-2",
                    )
                )
            )
            task_3 = asyncio.create_task(
                manager.set_section_sizes(
                    SetSectionSizesRequest(
                        projectConfigId=project_config_id,
                        sectionSizes={
                            section_ids.callable_section_id: SectionSize(
                                width=760.0,
                                height=500.0,
                            )
                        },
                        frontendOpId="section-sizes-3",
                    )
                )
            )

            await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

            blocker_release.set()
            await blocker_task
            await asyncio.gather(task_1, task_2, task_3)
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]

        project_state_after = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state_after,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert section_impl.size.width == 760.0
        assert section_impl.size.height == 500.0
        assert _get_handler_call_count(manager, "set_section_sizes") == 1
        assert _set_op_ids(completed_op_ids_by_patch) == {
            "section-sizes-1",
            "section-sizes-2",
            "section-sizes-3",
        }


@pytest.mark.asyncio
async def test_set_section_column_width_coalesces_same_key_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        completed_op_ids_by_patch: list[list[str]] = []
        original_section_patch = sender.broadcast_project_state_section_impl_patch

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            completed_op_ids_by_patch.append(list(completed_op_ids))
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        try:
            blocker_started = asyncio.Event()
            blocker_release = asyncio.Event()

            async def blocker() -> None:
                blocker_started.set()
                await blocker_release.wait()

            blocker_task = asyncio.create_task(manager._enqueue(blocker()))
            await blocker_started.wait()

            manager.reset_queue_timing_metrics()
            task_1 = asyncio.create_task(
                manager.set_section_column_width(
                    SetSectionColumnWidthRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        columnWidth=240.0,
                        frontendOpId="section-col-width-1",
                    )
                )
            )
            task_2 = asyncio.create_task(
                manager.set_section_column_width(
                    SetSectionColumnWidthRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        columnWidth=300.0,
                        frontendOpId="section-col-width-2",
                    )
                )
            )
            task_3 = asyncio.create_task(
                manager.set_section_column_width(
                    SetSectionColumnWidthRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.callable_section_id,
                        columnWidth=360.0,
                        frontendOpId="section-col-width-3",
                    )
                )
            )

            await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

            blocker_release.set()
            await blocker_task
            await asyncio.gather(task_1, task_2, task_3)
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]

        project_state_after = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state_after,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        assert section_impl.columnWidth == 360.0
        assert _get_handler_call_count(manager, "set_section_column_width") == 1
        assert _set_op_ids(completed_op_ids_by_patch) == {
            "section-col-width-1",
            "section-col-width-2",
            "section-col-width-3",
        }


@pytest.mark.asyncio
async def test_set_browser_column_widths_coalesces_same_key_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        completed_op_ids_by_patch: list[list[str]] = []
        original_section_patch = sender.broadcast_project_state_section_impl_patch

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            completed_op_ids_by_patch.append(list(completed_op_ids))
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        try:
            blocker_started = asyncio.Event()
            blocker_release = asyncio.Event()

            async def blocker() -> None:
                blocker_started.set()
                await blocker_release.wait()

            blocker_task = asyncio.create_task(manager._enqueue(blocker()))
            await blocker_started.wait()

            manager.reset_queue_timing_metrics()
            task_1 = asyncio.create_task(
                manager.set_browser_column_widths(
                    SetBrowserColumnWidthsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        columnWidth=320.0,
                        typesColumnWidth=120.0,
                        frontendOpId="browser-width-1",
                    )
                )
            )
            task_2 = asyncio.create_task(
                manager.set_browser_column_widths(
                    SetBrowserColumnWidthsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        columnWidth=360.0,
                        typesColumnWidth=140.0,
                        frontendOpId="browser-width-2",
                    )
                )
            )
            task_3 = asyncio.create_task(
                manager.set_browser_column_widths(
                    SetBrowserColumnWidthsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_ids.browser_section_id,
                        columnWidth=400.0,
                        typesColumnWidth=180.0,
                        frontendOpId="browser-width-3",
                    )
                )
            )

            await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

            blocker_release.set()
            await blocker_task
            await asyncio.gather(task_1, task_2, task_3)
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]

        project_state_after = manager.get_single_config_state(project_config_id)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state_after,
            section_ids.browser_section_id,
            BrowserSectionImpl,
        )
        assert section_impl.columnWidth == 400.0
        assert section_impl.typesColumnWidth == 180.0
        assert _get_handler_call_count(manager, "set_browser_column_widths") == 1
        assert _set_op_ids(completed_op_ids_by_patch) == {
            "browser-width-1",
            "browser-width-2",
            "browser-width-3",
        }


@pytest.mark.asyncio
async def test_set_viewport_coalesces_same_project_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, _ = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        blocker_started = asyncio.Event()
        blocker_release = asyncio.Event()

        async def blocker() -> None:
            blocker_started.set()
            await blocker_release.wait()

        blocker_task = asyncio.create_task(manager._enqueue(blocker()))
        await blocker_started.wait()

        manager.reset_queue_timing_metrics()
        manager.completed_op_ids_since_last_broadcast.clear()
        task_1 = asyncio.create_task(
            manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=10.0, y=20.0, zoom=0.8),
                    frontendOpId="viewport-1",
                )
            )
        )
        task_2 = asyncio.create_task(
            manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=30.0, y=40.0, zoom=0.9),
                    frontendOpId="viewport-2",
                )
            )
        )
        task_3 = asyncio.create_task(
            manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=50.0, y=60.0, zoom=1.1),
                    frontendOpId="viewport-3",
                )
            )
        )

        await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

        blocker_release.set()
        await blocker_task
        await asyncio.gather(task_1, task_2, task_3)
        await manager.finish_pending_operations(timeout=5.0)

        project_state_after = manager.get_single_config_state(project_config_id)
        assert project_state_after.projectConfig.viewport == Viewport(
            x=50.0,
            y=60.0,
            zoom=1.1,
        )
        assert _get_handler_call_count(manager, "set_viewport") == 1
        assert set(manager.completed_op_ids_since_last_broadcast) == {
            "viewport-1",
            "viewport-2",
            "viewport-3",
        }


@pytest.mark.asyncio
async def test_set_section_column_width_does_not_coalesce_different_sections() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state, section_ids = _build_drag_route_project_state()
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        blocker_started = asyncio.Event()
        blocker_release = asyncio.Event()

        async def blocker() -> None:
            blocker_started.set()
            await blocker_release.wait()

        blocker_task = asyncio.create_task(manager._enqueue(blocker()))
        await blocker_started.wait()

        manager.reset_queue_timing_metrics()
        task_1 = asyncio.create_task(
            manager.set_section_column_width(
                SetSectionColumnWidthRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id,
                    columnWidth=250.0,
                    frontendOpId="different-section-1",
                )
            )
        )
        task_2 = asyncio.create_task(
            manager.set_section_column_width(
                SetSectionColumnWidthRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_ids.callable_section_id_2,
                    columnWidth=420.0,
                    frontendOpId="different-section-2",
                )
            )
        )

        await _wait_for_pending_frontend_ops_at_least(manager, 2, timeout_s=1.0)
        blocker_release.set()
        await blocker_task
        await asyncio.gather(task_1, task_2)
        await manager.finish_pending_operations(timeout=5.0)

        project_state_after = manager.get_single_config_state(project_config_id)
        section_impl_1 = get_curr_effective_section_impl_with_type_guard(
            project_state_after,
            section_ids.callable_section_id,
            CallableSectionImpl,
        )
        section_impl_2 = get_curr_effective_section_impl_with_type_guard(
            project_state_after,
            section_ids.callable_section_id_2,
            CallableSectionImpl,
        )
        assert section_impl_1.columnWidth == 250.0
        assert section_impl_2.columnWidth == 420.0
        assert _get_handler_call_count(manager, "set_section_column_width") == 2
