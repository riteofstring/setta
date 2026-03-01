from types import SimpleNamespace

import pytest

from setta.project_state.project_manager_types import (
    RunCodeRequest,
    SetGenCodePrefixRequest,
    UndoRequest,
)
from setta.types.project_config import get_python_codegen_target_with_type_guard
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_set_gen_code_prefix_uses_project_config_patch_and_defers_refresh() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        await manager.update(project_state, updateFileWatcher=False)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        scheduled_refreshes: list[str] = []

        def record_schedule(project_config_id_for_refresh: str) -> None:
            scheduled_refreshes.append(project_config_id_for_refresh)

        manager._schedule_deferred_gen_code_prefix_suffix_refresh = record_schedule  # type: ignore[method-assign]

        sender = manager.websocket_msg_handler
        snapshot_calls = 0
        project_config_patch_calls: list[dict[str, int | str]] = []
        original_snapshot = sender.broadcast_project_state
        original_project_config_patch = (
            sender.broadcast_project_state_project_config_patch
        )

        async def record_snapshot(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal snapshot_calls
            snapshot_calls += 1
            await original_snapshot(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_project_config_patch(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            project_config_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                }
            )
            await original_project_config_patch(
                project_config_id_for_patch,
                project_config_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (
            record_project_config_patch  # type: ignore[method-assign]
        )
        try:
            await manager.set_gen_code_prefix(
                SetGenCodePrefixRequest(
                    projectConfigId=project_config_id,
                    genCodePrefix="import math\n",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_snapshot  # type: ignore[method-assign]
            sender.broadcast_project_state_project_config_patch = (
                original_project_config_patch  # type: ignore[method-assign]
            )

        assert [project_config_id] == scheduled_refreshes
        assert 0 == snapshot_calls
        assert 1 == len(project_config_patch_calls)
        patch = project_config_patch_calls[0]
        assert patch["projectConfigId"] == project_config_id
        assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]


@pytest.mark.asyncio
async def test_finish_pending_operations_waits_for_gen_code_prefix_deferred_refresh() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        await manager.update(project_state, updateFileWatcher=False)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh_codegen_state = manager._refresh_codegen_state

        async def record_refresh_codegen_state(project_state_for_refresh) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh_codegen_state(project_state_for_refresh)

        manager._refresh_codegen_state = record_refresh_codegen_state  # type: ignore[method-assign]
        try:
            await manager.set_gen_code_prefix(
                SetGenCodePrefixRequest(
                    projectConfigId=project_config_id,
                    genCodePrefix="import pathlib\n",
                )
            )
            # Prefix edits schedule deferred codegen refresh via debouncer.
            assert (
                project_config_id
                in manager._pending_gen_code_prefix_suffix_refresh_by_project_config
            )
            refresh_calls_before_wait = refresh_calls
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh_codegen_state  # type: ignore[method-assign]

        assert refresh_calls == refresh_calls_before_wait + 1
        assert (
            project_config_id
            not in manager._pending_gen_code_prefix_suffix_refresh_by_project_config
        )


@pytest.mark.asyncio
async def test_create_run_command_flushes_pending_gen_code_prefix_refresh() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        await manager.update(project_state, updateFileWatcher=False)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        refresh_calls = 0
        original_refresh_codegen_state = manager._refresh_codegen_state

        async def record_refresh_codegen_state(project_state_for_refresh) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh_codegen_state(project_state_for_refresh)

        manager._refresh_codegen_state = record_refresh_codegen_state  # type: ignore[method-assign]

        def mark_pending_refresh_only(project_config_id_for_refresh: str) -> None:
            manager._pending_gen_code_prefix_suffix_refresh_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = SimpleNamespace(
                history_revision=manager.history.revision,
                history_entry_token=manager.history.get_current_entry_token(),
            )

        manager._schedule_deferred_gen_code_prefix_suffix_refresh = (  # type: ignore[method-assign]
            mark_pending_refresh_only
        )
        try:
            await manager.set_gen_code_prefix(
                SetGenCodePrefixRequest(
                    projectConfigId=project_config_id,
                    genCodePrefix="import math\n",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
            assert 0 == refresh_calls

            await manager.create_run_command(
                RunCodeRequest(
                    projectConfigId=project_config_id,
                    sectionId=None,
                    terminalSectionId=None,
                    cliId=None,
                    runSnapshotMode=None,
                    drawSnapshotsBySectionId=None,
                    sectionVariantOverrides=None,
                    paramOverrides=None,
                )
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            manager._refresh_codegen_state = original_refresh_codegen_state  # type: ignore[method-assign]

        assert 1 == refresh_calls
        assert (
            project_config_id
            not in manager._pending_gen_code_prefix_suffix_refresh_by_project_config  # type: ignore[attr-defined]
        )
        assert "import math" in manager.gen_code[project_config_id].code


@pytest.mark.asyncio
async def test_set_gen_code_prefix_undo_restores_previous_value() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        await manager.update(project_state, updateFileWatcher=False)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        project_config = manager.project_state_backend.projectConfigs[project_config_id]
        original_prefix = get_python_codegen_target_with_type_guard(
            project_config
        ).genCodePrefix

        await manager.set_gen_code_prefix(
            SetGenCodePrefixRequest(
                projectConfigId=project_config_id,
                genCodePrefix="import math\n",
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        updated_prefix = get_python_codegen_target_with_type_guard(
            manager.project_state_backend.projectConfigs[project_config_id]
        ).genCodePrefix
        assert updated_prefix == "import math\n"

        await manager.undo(
            UndoRequest(
                projectConfigId=project_config_id,
                steps=1,
            )
        )
        await manager.finish_pending_operations(timeout=5.0)
        reverted_prefix = get_python_codegen_target_with_type_guard(
            manager.project_state_backend.projectConfigs[project_config_id]
        ).genCodePrefix
        assert reverted_prefix == original_prefix


@pytest.mark.asyncio
async def test_flush_pending_gen_code_prefix_refresh_uses_patch_transport() -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        await manager.update(project_state, updateFileWatcher=False)
        await manager.finish_pending_operations(timeout=5.0)
        project_config_id = project_state.projectConfig.id

        def mark_pending_refresh_only(project_config_id_for_refresh: str) -> None:
            manager._pending_gen_code_prefix_suffix_refresh_by_project_config[  # type: ignore[attr-defined]
                project_config_id_for_refresh
            ] = SimpleNamespace(
                history_revision=manager.history.revision,
                history_entry_token=manager.history.get_current_entry_token(),
            )

        manager._schedule_deferred_gen_code_prefix_suffix_refresh = (  # type: ignore[method-assign]
            mark_pending_refresh_only
        )

        sender = manager.websocket_msg_handler
        snapshot_calls = 0
        section_impl_patch_calls = 0
        project_config_patch_calls = 0
        op_status_patch_calls = 0
        original_snapshot = sender.broadcast_project_state
        original_section_patch = sender.broadcast_project_state_section_impl_patch
        original_project_config_patch = (
            sender.broadcast_project_state_project_config_patch
        )
        original_op_status_patch = sender.broadcast_project_state_op_status_patch

        async def record_snapshot(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal snapshot_calls
            snapshot_calls += 1
            await original_snapshot(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal section_impl_patch_calls
            section_impl_patch_calls += 1
            await original_section_patch(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_project_config_patch(
            project_config_id_for_patch,
            project_config_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal project_config_patch_calls
            project_config_patch_calls += 1
            await original_project_config_patch(
                project_config_id_for_patch,
                project_config_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_op_status_patch(
            project_config_id_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            nonlocal op_status_patch_calls
            op_status_patch_calls += 1
            await original_op_status_patch(
                project_config_id_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_snapshot  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_patch  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (
            record_project_config_patch  # type: ignore[method-assign]
        )
        sender.broadcast_project_state_op_status_patch = record_op_status_patch  # type: ignore[method-assign]
        try:
            await manager.set_gen_code_prefix(
                SetGenCodePrefixRequest(
                    projectConfigId=project_config_id,
                    genCodePrefix="import math\n",
                )
            )
            await manager.finish_pending_operations(timeout=5.0)

            snapshot_calls = 0
            section_impl_patch_calls = 0
            project_config_patch_calls = 0
            op_status_patch_calls = 0

            await manager._flush_pending_gen_code_prefix_suffix_refresh(
                project_config_id
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_snapshot  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = original_section_patch  # type: ignore[method-assign]
            sender.broadcast_project_state_project_config_patch = (
                original_project_config_patch  # type: ignore[method-assign]
            )
            sender.broadcast_project_state_op_status_patch = original_op_status_patch  # type: ignore[method-assign]

        assert 0 == snapshot_calls
        assert (
            section_impl_patch_calls
            + project_config_patch_calls
            + op_status_patch_calls
            >= 1
        )
