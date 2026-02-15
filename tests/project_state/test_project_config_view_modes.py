from typing import TYPE_CHECKING

import pytest

from setta.project_state.project_manager_types import (
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateViewModeRequest,
    DeleteViewModeRequest,
    SetActiveViewModeRequest,
    SetSectionVariantSortOrderRequest,
    SetTopLevelSectionLayoutRequest,
    SetViewModeSortOrderRequest,
    SetViewportRequest,
    ToggleViewModeTabRequest,
)
from setta.types.project_config import TopLevelSectionLayout, Viewport
from setta.types.section_impls import SectionType
from tests.utils.manager_fixture import real_project_manager


if TYPE_CHECKING:
    from setta.project_state.session_project_manager import SessionProjectManager
    from setta.types.project_state import ProjectStateSingleConfig


async def ensure_top_level_section(
    manager: "SessionProjectManager",
    project_config_id: str,
) -> tuple[str, "ProjectStateSingleConfig"]:
    project_state = manager.get_single_config_state(project_config_id)
    if not project_state.projectConfig.topLevelSections:
        await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Dict,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        project_state = manager.get_single_config_state(project_config_id)
    section_id = next(iter(project_state.projectConfig.topLevelSections.keys()))
    return section_id, project_state


@pytest.mark.asyncio
class TestProjectConfigViewModes:
    async def test_create_project_config_starts_with_single_view_mode(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            existing_ids = set(manager.project_state_backend.projectConfigs.keys())

            await manager.create_project_config("bg-blue-500/60 dark:bg-blue-600/30")

            new_ids = set(manager.project_state_backend.projectConfigs.keys())
            new_ids = new_ids - existing_ids
            assert len(new_ids) == 1
            new_id = next(iter(new_ids))

            project_config = manager.project_state_backend.projectConfigs[new_id]
            assert len(project_config.viewModes) == 1

            project_state = manager.get_single_config_state(new_id)
            assert len(project_state.projectConfig.viewModes) == 1

    async def test_toggle_view_mode_tab_updates_flag(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            project_state = manager.get_single_config_state(project_config_id)
            view_mode_id = next(iter(project_state.projectConfig.viewModes.keys()))
            view_mode = project_state.projectConfig.viewModes[view_mode_id]
            assert view_mode.isTab is False

            await manager.toggle_view_mode_tab(
                ToggleViewModeTabRequest(
                    projectConfigId=project_config_id,
                    viewModeId=view_mode_id,
                )
            )

            updated_state = manager.get_single_config_state(project_config_id)
            updated_view_mode = updated_state.projectConfig.viewModes[view_mode_id]
            assert updated_view_mode.isTab is True

    async def test_view_modes_store_layout_and_viewport(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            section_id, project_state = await ensure_top_level_section(
                manager, project_config_id
            )
            active_view_mode_id = project_state.projectConfig.activeViewModeId
            assert active_view_mode_id is not None
            layout = project_state.projectConfig.topLevelSections[
                section_id
            ].model_copy(deep=True)
            layout.x += 120
            layout.y += 80
            top_level_sections = dict(project_state.projectConfig.topLevelSections)
            top_level_sections[section_id] = layout

            await manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=top_level_sections,
                )
            )

            await manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=12.5, y=-3.25, zoom=1.4),
                )
            )

            refreshed = manager.get_single_config_state(project_config_id)
            view_mode = refreshed.projectConfig.viewModes[active_view_mode_id]
            assert view_mode.topLevelSections[section_id].x == layout.x
            assert view_mode.topLevelSections[section_id].y == layout.y
            assert view_mode.viewport is not None
            assert view_mode.viewportInitialized is True
            assert view_mode.viewport.x == pytest.approx(12.5)
            assert view_mode.viewport.y == pytest.approx(-3.25)
            assert view_mode.viewport.zoom == pytest.approx(1.4)

    async def test_create_top_level_section_prunes_stale_layout_ids(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )

            stale_section_id = "stale-section-id"
            project_config = manager.project_state_backend.projectConfigs[project_config_id]
            project_config.topLevelSections[stale_section_id] = TopLevelSectionLayout()
            active_view_mode_id = project_config.activeViewModeId
            assert active_view_mode_id is not None
            active_view_mode = project_config.viewModes[active_view_mode_id]
            active_view_mode.topLevelSections[stale_section_id] = TopLevelSectionLayout()
            active_view_mode.visibilityBySectionId[stale_section_id] = True

            create_response = await manager.create_top_level_section(
                CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Dict,
                    controlCodeObjType=None,
                    implOverrides=None,
                    position=None,
                    topLevelSections=None,
                    viewportBounds=None,
                )
            )
            assert create_response.sectionId

            updated_state = manager.get_single_config_state(project_config_id)
            assert stale_section_id not in updated_state.projectConfig.topLevelSections
            for view_mode in updated_state.projectConfig.viewModes.values():
                assert stale_section_id not in view_mode.topLevelSections
                assert stale_section_id not in view_mode.visibilityBySectionId

    async def test_switching_view_modes_swaps_layout_and_viewport(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            section_id, project_state = await ensure_top_level_section(
                manager, project_config_id
            )
            first_view_mode_id = project_state.projectConfig.activeViewModeId
            assert first_view_mode_id is not None
            layout_a = project_state.projectConfig.topLevelSections[
                section_id
            ].model_copy(deep=True)
            layout_a.x += 200
            layout_a.y += 150
            top_level_sections_a = dict(project_state.projectConfig.topLevelSections)
            top_level_sections_a[section_id] = layout_a

            await manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=top_level_sections_a,
                )
            )
            await manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=5.0, y=10.0, zoom=0.8),
                )
            )

            second_view_mode_id = await manager.create_view_mode(
                CreateViewModeRequest(projectConfigId=project_config_id)
            )

            state_after_create = manager.get_single_config_state(project_config_id)
            assert state_after_create.projectConfig.activeViewModeId == second_view_mode_id

            layout_b = state_after_create.projectConfig.topLevelSections[
                section_id
            ].model_copy(deep=True)
            layout_b.x += 400
            layout_b.y += 300
            top_level_sections_b = dict(
                state_after_create.projectConfig.topLevelSections
            )
            top_level_sections_b[section_id] = layout_b

            await manager.set_top_level_section_layout(
                SetTopLevelSectionLayoutRequest(
                    projectConfigId=project_config_id,
                    topLevelSections=top_level_sections_b,
                )
            )
            await manager.set_viewport(
                SetViewportRequest(
                    projectConfigId=project_config_id,
                    viewport=Viewport(x=-20.0, y=30.0, zoom=1.6),
                )
            )

            await manager.set_active_view_mode(
                SetActiveViewModeRequest(
                    projectConfigId=project_config_id,
                    activeViewModeId=first_view_mode_id,
                )
            )
            state_back_to_first = manager.get_single_config_state(project_config_id)
            assert state_back_to_first.projectConfig.activeViewModeId == first_view_mode_id
            layout_back = state_back_to_first.projectConfig.topLevelSections[
                section_id
            ]
            assert layout_back.x == layout_a.x
            assert layout_back.y == layout_a.y
            assert state_back_to_first.projectConfig.viewport is not None
            assert state_back_to_first.projectConfig.viewport.x == pytest.approx(5.0)
            assert state_back_to_first.projectConfig.viewport.y == pytest.approx(10.0)
            assert state_back_to_first.projectConfig.viewport.zoom == pytest.approx(0.8)

            await manager.set_active_view_mode(
                SetActiveViewModeRequest(
                    projectConfigId=project_config_id,
                    activeViewModeId=second_view_mode_id,
                )
            )
            state_back_to_second = manager.get_single_config_state(project_config_id)
            layout_back_second = state_back_to_second.projectConfig.topLevelSections[
                section_id
            ]
            assert layout_back_second.x == layout_b.x
            assert layout_back_second.y == layout_b.y
            assert state_back_to_second.projectConfig.viewport is not None
            assert state_back_to_second.projectConfig.viewport.x == pytest.approx(-20.0)
            assert state_back_to_second.projectConfig.viewport.y == pytest.approx(30.0)
            assert state_back_to_second.projectConfig.viewport.zoom == pytest.approx(1.6)

    async def test_set_view_mode_sort_order_rejects_duplicate_ids(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            initial_state = manager.get_single_config_state(project_config_id)
            first_view_mode_id = initial_state.projectConfig.activeViewModeId
            assert first_view_mode_id is not None
            second_view_mode_id = await manager.create_view_mode(
                CreateViewModeRequest(projectConfigId=project_config_id)
            )

            with pytest.raises(
                ValueError,
                match="orderedViewModeIds must not contain duplicate view mode IDs.",
            ):
                await manager.set_view_mode_sort_order(
                    SetViewModeSortOrderRequest(
                        projectConfigId=project_config_id,
                        orderedViewModeIds=[first_view_mode_id, first_view_mode_id],
                    )
                )

            updated_state = manager.get_single_config_state(project_config_id)
            assert second_view_mode_id in updated_state.projectConfig.viewModes

    async def test_set_section_variant_sort_order_rejects_duplicate_ids(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            section_id, _ = await ensure_top_level_section(manager, project_config_id)
            await manager.create_new_section_variant(
                CreateNewSectionVariantRequest(
                    projectConfigId=project_config_id,
                    sectionId=section_id,
                )
            )

            project_state = manager.get_single_config_state(project_config_id)
            variant_ids = list(project_state.sections[section_id].variants)
            assert len(variant_ids) >= 2

            with pytest.raises(
                ValueError,
                match="orderedVariantIds must not contain duplicate variant IDs.",
            ):
                await manager.set_section_variant_sort_order(
                    SetSectionVariantSortOrderRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        orderedVariantIds=[variant_ids[0], variant_ids[0]],
                    )
                )

    async def test_set_section_variant_sort_order_raises_for_missing_section(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )

            with pytest.raises(
                KeyError, match="Section missing-section-id not found"
            ):
                await manager.set_section_variant_sort_order(
                    SetSectionVariantSortOrderRequest(
                        projectConfigId=project_config_id,
                        sectionId="missing-section-id",
                        orderedVariantIds=[],
                    )
                )

    async def test_delete_active_view_mode_uses_sorted_order_fallback(self) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            project_config_id = next(
                iter(manager.project_state_backend.projectConfigs.keys())
            )
            initial_state = manager.get_single_config_state(project_config_id)
            first_view_mode_id = initial_state.projectConfig.activeViewModeId
            assert first_view_mode_id is not None

            second_view_mode_id = await manager.create_view_mode(
                CreateViewModeRequest(projectConfigId=project_config_id)
            )
            third_view_mode_id = await manager.create_view_mode(
                CreateViewModeRequest(projectConfigId=project_config_id)
            )

            # Keep insertion order as [first, second, third], but sorted order as
            # [second, third, first] so delete fallback must use sorted order.
            await manager.set_view_mode_sort_order(
                SetViewModeSortOrderRequest(
                    projectConfigId=project_config_id,
                    orderedViewModeIds=[
                        second_view_mode_id,
                        third_view_mode_id,
                        first_view_mode_id,
                    ],
                )
            )
            await manager.set_active_view_mode(
                SetActiveViewModeRequest(
                    projectConfigId=project_config_id,
                    activeViewModeId=third_view_mode_id,
                )
            )

            await manager.delete_view_mode(
                DeleteViewModeRequest(
                    projectConfigId=project_config_id,
                    viewModeId=third_view_mode_id,
                )
            )

            updated_state = manager.get_single_config_state(project_config_id)
            assert updated_state.projectConfig.activeViewModeId == second_view_mode_id
            assert (
                updated_state.projectConfig.viewModes[second_view_mode_id].sortIndex
                == 0
            )
            assert (
                updated_state.projectConfig.viewModes[first_view_mode_id].sortIndex
                == 1
            )
