import asyncio
import types
from dataclasses import dataclass
from typing import Awaitable, Callable, cast

import pytest
from setta.project_state.base_project_manager import BaseProjectManager
from setta.types.id import ID

from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)


@dataclass(slots=True)
class _RenamePayload:
    projectConfigId: ID
    newName: str
    frontendOpId: str | None = None


OriginalSetProjectConfigName = Callable[[BaseProjectManager, str, str], Awaitable[None]]


def _bind_delayed_set_project_config_name(
    manager: BaseProjectManager, *, delay: float = 0.05
):
    maybe_original = getattr(
        BaseProjectManager.set_project_config_name, "__wrapped__", None
    )
    if maybe_original is None or not callable(maybe_original):
        raise TypeError("set_project_config_name.__wrapped__ must be callable")
    original: OriginalSetProjectConfigName = cast(
        "OriginalSetProjectConfigName", maybe_original
    )

    @BaseProjectManager.enqueue_method
    async def delayed_set_project_config_name(
        self: BaseProjectManager, request: _RenamePayload
    ) -> None:
        await asyncio.sleep(delay)
        await original(self, request.projectConfigId, request.newName)

    return types.MethodType(delayed_set_project_config_name, manager)


@pytest.mark.asyncio
class TestManualSaveQueueDrain:
    async def test_settings_manual_save_waits_for_pending_ops(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_project_config_name(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_name = manager.project_state_backend.projectConfigs[
                default_config_id
            ].name
            new_name = f"{original_name}_queue"

            request = _RenamePayload(
                projectConfigId=default_config_id,
                newName=new_name,
                frontendOpId="settings-op",
            )

            on_disk_before = fixture.dbe.read_settings_project()
            assert on_disk_before.projectConfig.name == original_name

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "settings-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "settings-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[default_config_id].name
                == new_name
            )

            on_disk_before_save = fixture.dbe.read_settings_project()
            assert on_disk_before_save.projectConfig.name == original_name

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_settings_project()
            assert on_disk_after.projectConfig.name == new_name

    async def test_project_manual_save_waits_for_pending_ops(self):
        async with real_project_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_project_config_name(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_name = manager.project_state_backend.projectConfigs[
                default_config_id
            ].name
            new_name = f"{original_name}_queue"

            request = _RenamePayload(
                projectConfigId=default_config_id,
                newName=new_name,
                frontendOpId="project-op",
            )

            on_disk_before = fixture.dbe.read_project()
            assert (
                on_disk_before.projectConfigs[default_config_id].name
                == original_name
            )

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "project-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "project-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[default_config_id].name
                == new_name
            )

            on_disk_before_save = fixture.dbe.read_project()
            assert (
                on_disk_before_save.projectConfigs[default_config_id].name
                == original_name
            )

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_project()
            assert on_disk_after.projectConfigs[default_config_id].name == new_name
