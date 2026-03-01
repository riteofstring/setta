from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

from fastapi import HTTPException
import pytest

from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.routers.projects import (
    DeleteProjectConfigsRequest,
    route_delete_project_configs,
)
from setta.terminals.terminals import Terminals
from setta.types.id import ID
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.manager_fixture import real_project_manager, real_settings_manager

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState


def _build_runtime_state(project_fixture, settings_fixture) -> "SettaFastAPIState":
    switcher = ProjectManagerSwitcher(
        main_manager=project_fixture.manager,
        settings_manager=settings_fixture.manager,
    )
    frontend_sender = WMHFrontendSender(WebsocketManager())
    terminals = Terminals(frontend_sender, project_fixture.settings_file)
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=frontend_sender,
        share_mode=False,
        deployment_mode=False,
        terminals=terminals,
    )
    return cast("SettaFastAPIState", state)


@pytest.mark.asyncio
async def test_delete_project_configs_missing_id_returns_http_404_without_partial_delete() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        state = _build_runtime_state(project_fixture, settings_fixture)
        manager = state.project_manager_switcher.main
        existing_ids_before = set(manager.project_state_backend.projectConfigs.keys())

        await manager.create_project_config(previewImgColor="#abcdef")
        ids_after_create = set(manager.project_state_backend.projectConfigs.keys())
        created_ids = ids_after_create - existing_ids_before
        assert len(created_ids) == 1
        created_project_config_id = next(iter(created_ids))

        request = DeleteProjectConfigsRequest(
            ids=[created_project_config_id, ID("missing-project-config-id")]
        )

        with pytest.raises(HTTPException) as raised:
            await route_delete_project_configs(request, state)

        assert raised.value.status_code == 404
        assert "missing-project-config-id" in str(raised.value.detail)
        remaining_ids = set(manager.project_state_backend.projectConfigs.keys())
        assert created_project_config_id in remaining_ids
