from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

from fastapi import HTTPException
import pytest

from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.project_manager_types import (
    CreateNewSectionVariantRequest,
    CreateTopLevelSectionRequest,
    CreateViewModeRequest,
    SetSectionVariantSortOrderRequest,
    SetViewModeSortOrderRequest,
)
from setta.routers.project_manager import (
    route_set_section_variant_sort_order,
    route_set_view_mode_sort_order,
)
from setta.types.section_impls import SectionType
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.manager_fixture import real_project_manager, real_settings_manager
from tests.utils.runtime_context import runtime_context

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState


def _build_runtime_state(project_fixture, settings_fixture) -> "SettaFastAPIState":
    switcher = ProjectManagerSwitcher(
        main_manager=project_fixture.manager,
        settings_manager=settings_fixture.manager,
    )
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=WMHFrontendSender(WebsocketManager()),
        share_mode=False,
        deployment_mode=False,
    )
    return cast("SettaFastAPIState", state)


def _get_default_project_config_id(state: "SettaFastAPIState") -> str:
    default_project_config_id = (
        state.project_manager_switcher.main.project_state_backend.defaultProjectConfigId
    )
    if default_project_config_id is None:
        pytest.fail("Expected default project config id for sort-order route test.")
    return default_project_config_id


@pytest.mark.asyncio
async def test_set_view_mode_sort_order_maps_value_error_to_http_422() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        state = _build_runtime_state(project_fixture, settings_fixture)
        project_config_id = _get_default_project_config_id(state)
        manager = state.project_manager_switcher.main

        first_view_mode_id = manager.get_single_config_state(
            project_config_id
        ).projectConfig.activeViewModeId
        if first_view_mode_id is None:
            pytest.fail("Expected active view mode for sort-order route test.")
        second_view_mode_id = await manager.create_view_mode(
            CreateViewModeRequest(projectConfigId=project_config_id)
        )

        request = SetViewModeSortOrderRequest(
            projectConfigId=project_config_id,
            orderedViewModeIds=[first_view_mode_id, first_view_mode_id],
        )
        with pytest.raises(HTTPException) as raised:
            with runtime_context(state) as runtime_ctx:
                await route_set_view_mode_sort_order(request, runtime_ctx)

        assert raised.value.status_code == 422
        assert (
            raised.value.detail
            == "orderedViewModeIds must not contain duplicate view mode IDs."
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert second_view_mode_id in updated_state.projectConfig.viewModes


@pytest.mark.asyncio
async def test_set_view_mode_sort_order_maps_key_error_to_http_404() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        state = _build_runtime_state(project_fixture, settings_fixture)
        project_config_id = _get_default_project_config_id(state)
        manager = state.project_manager_switcher.main

        first_view_mode_id = manager.get_single_config_state(
            project_config_id
        ).projectConfig.activeViewModeId
        if first_view_mode_id is None:
            pytest.fail("Expected active view mode for sort-order route test.")
        await manager.create_view_mode(
            CreateViewModeRequest(projectConfigId=project_config_id)
        )

        request = SetViewModeSortOrderRequest(
            projectConfigId=project_config_id,
            orderedViewModeIds=[first_view_mode_id, "missing-view-mode"],
        )
        with pytest.raises(HTTPException) as raised:
            with runtime_context(state) as runtime_ctx:
                await route_set_view_mode_sort_order(request, runtime_ctx)

        assert raised.value.status_code == 404
        assert "missing-view-mode" in str(raised.value.detail)


@pytest.mark.asyncio
async def test_set_section_variant_sort_order_maps_value_error_to_http_422() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        state = _build_runtime_state(project_fixture, settings_fixture)
        project_config_id = _get_default_project_config_id(state)
        manager = state.project_manager_switcher.main

        create_section_response = await manager.create_top_level_section(
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
        section_id = create_section_response.sectionId
        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
            )
        )
        variant_ids = list(
            manager.get_single_config_state(project_config_id).sections[section_id].variants
        )
        assert len(variant_ids) >= 2

        request = SetSectionVariantSortOrderRequest(
            projectConfigId=project_config_id,
            sectionId=section_id,
            orderedVariantIds=[variant_ids[0], variant_ids[0]],
        )
        with pytest.raises(HTTPException) as raised:
            with runtime_context(state) as runtime_ctx:
                await route_set_section_variant_sort_order(request, runtime_ctx)

        assert raised.value.status_code == 422
        assert (
            raised.value.detail
            == "orderedVariantIds must not contain duplicate variant IDs."
        )


@pytest.mark.asyncio
async def test_set_section_variant_sort_order_maps_key_error_to_http_404() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        state = _build_runtime_state(project_fixture, settings_fixture)
        project_config_id = _get_default_project_config_id(state)
        manager = state.project_manager_switcher.main

        create_section_response = await manager.create_top_level_section(
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
        section_id = create_section_response.sectionId
        await manager.create_new_section_variant(
            CreateNewSectionVariantRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
            )
        )
        variant_ids = list(
            manager.get_single_config_state(project_config_id).sections[section_id].variants
        )
        assert len(variant_ids) >= 2

        request = SetSectionVariantSortOrderRequest(
            projectConfigId=project_config_id,
            sectionId=section_id,
            orderedVariantIds=[variant_ids[0], "missing-variant-id"],
        )
        with pytest.raises(HTTPException) as raised:
            with runtime_context(state) as runtime_ctx:
                await route_set_section_variant_sort_order(request, runtime_ctx)

        assert raised.value.status_code == 404
        assert "missing-variant-id" in str(raised.value.detail)
