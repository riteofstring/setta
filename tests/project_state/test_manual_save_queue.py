import asyncio
import types
from typing import Awaitable, Callable, cast

import pytest
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.project_manager_types import SetWatchCodeEnabledRequest
from setta.types.id import ID

from tests.utils.manager_fixture import (
    real_project_manager,
    real_settings_manager,
)


OriginalSetWatchCodeEnabled = Callable[
    [BaseProjectManager, SetWatchCodeEnabledRequest], Awaitable[None]
]


def _bind_delayed_set_watch_code_enabled(
    manager: BaseProjectManager, *, delay: float = 0.05
):
    maybe_original = getattr(
        BaseProjectManager.set_watch_code_enabled, "__wrapped__", None
    )
    if maybe_original is None or not callable(maybe_original):
        raise TypeError("set_watch_code_enabled.__wrapped__ must be callable")
    original: OriginalSetWatchCodeEnabled = cast(
        "OriginalSetWatchCodeEnabled", maybe_original
    )

    @BaseProjectManager.enqueue_method
    async def delayed_set_watch_code_enabled(
        self: BaseProjectManager, request: SetWatchCodeEnabledRequest
    ) -> None:
        await asyncio.sleep(delay)
        await original(self, request)

    return types.MethodType(delayed_set_watch_code_enabled, manager)


@pytest.mark.asyncio
class TestManualSaveQueueDrain:
    async def test_settings_manual_save_waits_for_pending_ops(self):
        async with real_settings_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_watch_code_enabled(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_watch_code_enabled = manager.project_state_backend.projectConfigs[
                default_config_id
            ].watchCodeEnabled
            new_watch_code_enabled = not original_watch_code_enabled

            request = SetWatchCodeEnabledRequest(
                projectConfigId=default_config_id,
                enabled=new_watch_code_enabled,
                frontendOpId="settings-op",
            )

            on_disk_before = fixture.dbe.read_settings_project()
            assert (
                on_disk_before.projectConfig.watchCodeEnabled
                == original_watch_code_enabled
            )

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "settings-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "settings-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[
                    default_config_id
                ].watchCodeEnabled
                == new_watch_code_enabled
            )

            on_disk_before_save = fixture.dbe.read_settings_project()
            assert (
                on_disk_before_save.projectConfig.watchCodeEnabled
                == original_watch_code_enabled
            )

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_settings_project()
            assert (
                on_disk_after.projectConfig.watchCodeEnabled == new_watch_code_enabled
            )

    async def test_project_manual_save_waits_for_pending_ops(self):
        async with real_project_manager() as fixture:
            manager = fixture.manager
            delayed_method = _bind_delayed_set_watch_code_enabled(manager)

            default_config_id = manager.project_state_backend.defaultProjectConfigId
            assert default_config_id is not None
            default_config_id = ID(default_config_id)

            original_watch_code_enabled = manager.project_state_backend.projectConfigs[
                default_config_id
            ].watchCodeEnabled
            new_watch_code_enabled = not original_watch_code_enabled

            request = SetWatchCodeEnabledRequest(
                projectConfigId=default_config_id,
                enabled=new_watch_code_enabled,
                frontendOpId="project-op",
            )

            on_disk_before = fixture.dbe.read_project()
            assert (
                on_disk_before.projectConfigs[default_config_id].watchCodeEnabled
                == original_watch_code_enabled
            )

            op_task = asyncio.create_task(delayed_method(request))
            await asyncio.sleep(0)
            assert "project-op" in manager.pending_frontend_ops
            assert not op_task.done()

            await manager.finish_pending_operations()
            await op_task

            assert "project-op" not in manager.pending_frontend_ops
            assert (
                manager.project_state_backend.projectConfigs[
                    default_config_id
                ].watchCodeEnabled
                == new_watch_code_enabled
            )

            on_disk_before_save = fixture.dbe.read_project()
            assert (
                on_disk_before_save.projectConfigs[default_config_id].watchCodeEnabled
                == original_watch_code_enabled
            )

            manager.perform_manual_save()

            on_disk_after = fixture.dbe.read_project()
            assert (
                on_disk_after.projectConfigs[default_config_id].watchCodeEnabled
                == new_watch_code_enabled
            )
