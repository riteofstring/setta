import asyncio
import time
from typing import cast

import pytest
from setta.project_state.project_manager_types import SetParamEnteredValueRequest
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.id import ID

from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager

_SECTION_ID = ID("section-1")
_PARAM_ID_0 = ID("param-0")
_PARAM_ID_1 = ID("param-1")


async def _wait_for_pending_frontend_ops_at_least(
    manager, size: int, timeout_s: float
) -> None:
    start = time.monotonic()
    while len(manager.pending_frontend_ops) < size:
        if time.monotonic() - start > timeout_s:
            pytest.fail(f"Expected pending frontend ops to reach at least {size}.")
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_set_param_entered_value_coalesces_same_param_updates() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        # Capture completed-op ids that ride on the code-obj patch transport.
        sender = manager.websocket_msg_handler
        completed_ids_by_patch: list[list[str]] = []
        original_code_obj_patch = sender.broadcast_project_state_code_objs_patch

        async def record_code_obj_patch(
            project_config_id_for_patch,
            code_objs_for_patch,
            code_obj_variants_for_patch,
            code_obj_impls_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            completed_ids_by_patch.append(list(completed_op_ids))
            await original_code_obj_patch(
                project_config_id_for_patch,
                code_objs_for_patch,
                code_obj_variants_for_patch,
                code_obj_impls_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state_code_objs_patch = record_code_obj_patch  # type: ignore[method-assign]
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
                manager.set_param_entered_value(
                    SetParamEnteredValueRequest(
                        projectConfigId=project_config_id,
                        sectionId=_SECTION_ID,
                        paramInfoId=_PARAM_ID_0,
                        value="value-1",
                        frontendOpId="coalesce-1",
                    )
                )
            )
            task_2 = asyncio.create_task(
                manager.set_param_entered_value(
                    SetParamEnteredValueRequest(
                        projectConfigId=project_config_id,
                        sectionId=_SECTION_ID,
                        paramInfoId=_PARAM_ID_0,
                        value="value-2",
                        frontendOpId="coalesce-2",
                    )
                )
            )
            task_3 = asyncio.create_task(
                manager.set_param_entered_value(
                    SetParamEnteredValueRequest(
                        projectConfigId=project_config_id,
                        sectionId=_SECTION_ID,
                        paramInfoId=_PARAM_ID_0,
                        value="value-3",
                        frontendOpId="coalesce-3",
                    )
                )
            )

            # Same-key updates should collapse to one queued write while blocked.
            await _wait_for_pending_frontend_ops_at_least(manager, 3, timeout_s=1.0)

            blocker_release.set()
            await blocker_task
            await asyncio.gather(task_1, task_2, task_3)
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state_code_objs_patch = original_code_obj_patch  # type: ignore[method-assign]

        project_state_after = manager.get_single_config_state(project_config_id)
        impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state_after,
            _SECTION_ID,
            _PARAM_ID_0,
            BaseChildlessCodeObjImpl,
        )
        assert impl.value == "value-3"

        snapshot = manager.get_queue_timing_metrics_snapshot()
        by_handler = cast("dict[str, object]", snapshot["byHandler"])
        set_param_metrics = cast(
            "dict[str, object]", by_handler["set_param_entered_value"]
        )
        assert set_param_metrics["calls"] == 1
        assert set_param_metrics["successes"] == 1
        assert set_param_metrics["failures"] == 0
        assert completed_ids_by_patch
        assert completed_ids_by_patch[-1] == ["coalesce-1", "coalesce-2", "coalesce-3"]


@pytest.mark.asyncio
async def test_set_param_entered_value_does_not_coalesce_different_params() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
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
            manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=_SECTION_ID,
                    paramInfoId=_PARAM_ID_0,
                    value="x-1",
                    frontendOpId="param-a",
                )
            )
        )
        task_2 = asyncio.create_task(
            manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    projectConfigId=project_config_id,
                    sectionId=_SECTION_ID,
                    paramInfoId=_PARAM_ID_1,
                    value="y-1",
                    frontendOpId="param-b",
                )
            )
        )

        # Different params use different coalesce keys and should queue separately.
        await _wait_for_pending_frontend_ops_at_least(manager, 2, timeout_s=1.0)
        blocker_release.set()
        await blocker_task
        await asyncio.gather(task_1, task_2)
        await manager.finish_pending_operations(timeout=5.0)

        snapshot = manager.get_queue_timing_metrics_snapshot()
        by_handler = cast("dict[str, object]", snapshot["byHandler"])
        set_param_metrics = cast(
            "dict[str, object]", by_handler["set_param_entered_value"]
        )
        assert set_param_metrics["calls"] == 2
