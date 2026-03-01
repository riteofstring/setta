import pytest

from setta.project_state.project_manager_types import (
    CodeFileBindingUpdate,
    GetChatSectionChatIdRequest,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetChatSectionChatIdRequest,
    SetChatSectionSettingsRequest,
    SetCodeFileBindingRequest,
    SetCodeSectionDiagnosticCodeSuppressionRequest,
    SetCodeSectionDiagnosticsMuteRequest,
    SetImageAreaImagePathRequest,
    SetListRootViewModeRequest,
    SetParentDefaultChildSectionTypeRequest,
    SetShowParamDisplayNamesRequest,
    SetSpreadsheetFilePathRequest,
    SetSpreadsheetSectionSettingsRequest,
    SetTaskBoardSectionStateRequest,
    SetTypeErrorIgnoreRequest,
)
from setta.types.artifact import ChartType, ScatterChartSettings
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    get_curr_top_level_param_ids,
)
from setta.types.id import ID
from setta.types.project_config import Position
from setta.types.section_impls import (
    ChatDictationMode,
    ChatPermissionMode,
    CodeFileAccessMode,
    ListRootViewMode,
    SectionType,
    SpreadsheetGridDensity,
    TaskBoardColumn,
    TaskBoardTask,
    TaskBoardViewMode,
)
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


@pytest.mark.asyncio
async def test_additional_section_scoped_routes_use_section_impl_patch_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(40)
        settings = SettingsState()
        callable_section_id = ID("section-1")
        code_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Code,
            Position(x=900, y=0),
            core_overrides={"name": "patch_transport_code"},
        )
        group_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Group,
            Position(x=980, y=80),
            core_overrides={"name": "patch_transport_group"},
        )
        list_root_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.ListRoot,
            Position(x=1040, y=140),
            core_overrides={"name": "patch_transport_list_root"},
        )
        task_board_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.TaskBoard,
            Position(x=1100, y=200),
            core_overrides={"name": "patch_transport_task_board"},
        )
        spreadsheet_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Spreadsheet,
            Position(x=1160, y=260),
            core_overrides={"name": "patch_transport_spreadsheet"},
        )
        chat_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chat,
            Position(x=1220, y=320),
            core_overrides={"name": "patch_transport_chat"},
        )
        image_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Image,
            Position(x=1280, y=380),
            core_overrides={"name": "patch_transport_image"},
        )
        chart_section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Chart,
            Position(x=1340, y=440),
            core_overrides={"name": "patch_transport_chart"},
        )
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        top_level_param_ids = get_curr_top_level_param_ids(
            manager.get_single_config_state(project_config_id),
            callable_section_id,
        )
        assert top_level_param_ids
        callable_param_id = top_level_param_ids[0]

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        section_impl_patch_calls: list[dict[str, int | str | list[str]]] = []
        name_validation_broadcast_calls = 0
        refresh_calls = 0
        scheduled_deferred_refreshes: list[ID] = []
        original_refresh = manager._refresh_codegen_state
        original_schedule_deferred_refresh = manager._schedule_deferred_codegen_refresh
        original_project_state_broadcast = sender.broadcast_project_state
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

        async def record_refresh(next_state) -> None:
            nonlocal refresh_calls
            refresh_calls += 1
            await original_refresh(next_state)

        def record_schedule_deferred_refresh(project_config_id_for_refresh: ID) -> None:
            scheduled_deferred_refreshes.append(project_config_id_for_refresh)

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
                project_state,
                completed_op_ids,
                pending_op_ids,
                project_state_revision,
            )

        async def record_section_impl_patch(
            project_config_id_for_patch,
            section_id_for_patch,
            section_impl_for_patch,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        ) -> None:
            section_impl_patch_calls.append(
                {
                    "projectConfigId": project_config_id_for_patch,
                    "sectionId": section_id_for_patch,
                    "sectionImplType": section_impl_for_patch.type,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_section_impl_patch_broadcast(
                project_config_id_for_patch,
                section_id_for_patch,
                section_impl_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        async def record_name_validation_broadcast(content) -> None:
            nonlocal name_validation_broadcast_calls
            name_validation_broadcast_calls += 1
            await original_name_validation_broadcast(content)

        async def assert_section_patch(
            *,
            expected_section_id: ID,
            expected_section_type: SectionType,
            operation_coro,
        ) -> None:
            await manager.finish_pending_operations(timeout=5.0)
            before_snapshot_calls = project_state_broadcast_calls
            before_patch_count = len(section_impl_patch_calls)
            before_name_validation_calls = name_validation_broadcast_calls
            before_refresh_calls = refresh_calls
            before_deferred_refresh_count = len(scheduled_deferred_refreshes)
            await operation_coro
            await manager.finish_pending_operations(timeout=5.0)
            assert project_state_broadcast_calls == before_snapshot_calls
            patches = section_impl_patch_calls[before_patch_count:]
            assert len(patches) == 1
            patch = patches[0]
            assert patch["projectConfigId"] == project_config_id
            assert patch["sectionId"] == expected_section_id
            assert patch["sectionImplType"] == expected_section_type
            assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]
            assert name_validation_broadcast_calls == before_name_validation_calls
            assert refresh_calls == before_refresh_calls
            assert (
                len(scheduled_deferred_refreshes) == before_deferred_refresh_count + 1
            )
            assert scheduled_deferred_refreshes[-1] == project_config_id

        manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
        manager._schedule_deferred_codegen_refresh = record_schedule_deferred_refresh  # type: ignore[method-assign]
        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = record_section_impl_patch  # type: ignore[method-assign]
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await assert_section_patch(
                expected_section_id=callable_section_id,
                expected_section_type=SectionType.Callable,
                operation_coro=manager.set_type_error_ignore(
                    SetTypeErrorIgnoreRequest(
                        projectConfigId=project_config_id,
                        sectionId=callable_section_id,
                        paramInfoId=callable_param_id,
                        ignoreTypeErrors=True,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=code_section_id,
                expected_section_type=SectionType.Code,
                operation_coro=manager.set_code_section_diagnostics_mute(
                    SetCodeSectionDiagnosticsMuteRequest(
                        projectConfigId=project_config_id,
                        sectionId=code_section_id,
                        mute=True,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=code_section_id,
                expected_section_type=SectionType.Code,
                operation_coro=manager.set_code_section_diagnostic_code_suppression(
                    SetCodeSectionDiagnosticCodeSuppressionRequest(
                        projectConfigId=project_config_id,
                        sectionId=code_section_id,
                        code="PY001",
                        suppress=True,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=code_section_id,
                expected_section_type=SectionType.Code,
                operation_coro=manager.set_code_file_binding(
                    SetCodeFileBindingRequest(
                        projectConfigId=project_config_id,
                        sectionId=code_section_id,
                        binding=CodeFileBindingUpdate(
                            canonical_path="/tmp/patch-transport-code-binding.py",
                            access_mode=CodeFileAccessMode.read_write,
                        ),
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=group_section_id,
                expected_section_type=SectionType.Group,
                operation_coro=manager.set_parent_default_child_section_type(
                    SetParentDefaultChildSectionTypeRequest(
                        projectConfigId=project_config_id,
                        sectionId=group_section_id,
                        defaultChildSectionType=SectionType.TextBlock,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=list_root_section_id,
                expected_section_type=SectionType.ListRoot,
                operation_coro=manager.set_list_root_view_mode(
                    SetListRootViewModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=list_root_section_id,
                        viewMode=ListRootViewMode.kanban,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=task_board_section_id,
                expected_section_type=SectionType.TaskBoard,
                operation_coro=manager.set_task_board_section_state(
                    SetTaskBoardSectionStateRequest(
                        projectConfigId=project_config_id,
                        sectionId=task_board_section_id,
                        viewMode=TaskBoardViewMode.task_list,
                        columns=[
                            TaskBoardColumn(
                                id=ID("task-board-column-1"),
                                name="Todo",
                                sortIndex=0,
                            )
                        ],
                        tasks=[
                            TaskBoardTask(
                                id=ID("task-board-task-1"),
                                title="Task 1",
                                columnId=ID("task-board-column-1"),
                                sortIndex=0,
                            )
                        ],
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=spreadsheet_section_id,
                expected_section_type=SectionType.Spreadsheet,
                operation_coro=manager.set_spreadsheet_file_path(
                    SetSpreadsheetFilePathRequest(
                        projectConfigId=project_config_id,
                        sectionId=spreadsheet_section_id,
                        filePath="/tmp/patch-transport-data.csv",
                        activeSheet="Sheet1",
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=spreadsheet_section_id,
                expected_section_type=SectionType.Spreadsheet,
                operation_coro=manager.set_spreadsheet_section_settings(
                    SetSpreadsheetSectionSettingsRequest(
                        projectConfigId=project_config_id,
                        sectionId=spreadsheet_section_id,
                        readOnly=True,
                        showRowNumbers=False,
                        density=SpreadsheetGridDensity.comfortable,
                        autoReloadOnExternalChange=True,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chat_section_id,
                expected_section_type=SectionType.Chat,
                operation_coro=manager.set_chat_section_settings(
                    SetChatSectionSettingsRequest(
                        projectConfigId=project_config_id,
                        sectionId=chat_section_id,
                        managed=True,
                        engineConfigId=None,
                        transcriptionProfileId=None,
                        agentProfileId=None,
                        thinking=False,
                        permissionMode=ChatPermissionMode.yolo,
                        searchEnabled=False,
                        dictationMode=ChatDictationMode.browser,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chat_section_id,
                expected_section_type=SectionType.Chat,
                operation_coro=manager.set_chat_section_chat_id(
                    SetChatSectionChatIdRequest(
                        projectConfigId=project_config_id,
                        sectionId=chat_section_id,
                        chatId=ID("stale-chat-id"),
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chat_section_id,
                expected_section_type=SectionType.Chat,
                operation_coro=manager.get_chat_section_chat_id(
                    GetChatSectionChatIdRequest(
                        projectConfigId=project_config_id,
                        sectionId=chat_section_id,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=image_section_id,
                expected_section_type=SectionType.Image,
                operation_coro=manager.set_image_area_image_path(
                    SetImageAreaImagePathRequest(
                        projectConfigId=project_config_id,
                        sectionId=image_section_id,
                        imagePath="/tmp/patch-transport-image.png",
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chart_section_id,
                expected_section_type=SectionType.Chart,
                operation_coro=manager.set_chart_area_data_path(
                    SetChartAreaDataPathRequest(
                        projectConfigId=project_config_id,
                        sectionId=chart_section_id,
                        dataPath="/tmp/patch-transport-chart.csv",
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chart_section_id,
                expected_section_type=SectionType.Chart,
                operation_coro=manager.set_chart_type(
                    SetChartTypeRequest(
                        projectConfigId=project_config_id,
                        sectionId=chart_section_id,
                        chartType=ChartType.scatter,
                    )
                ),
            )
            await assert_section_patch(
                expected_section_id=chart_section_id,
                expected_section_type=SectionType.Chart,
                operation_coro=manager.set_chart_settings(
                    SetChartSettingsRequest(
                        projectConfigId=project_config_id,
                        sectionId=chart_section_id,
                        chartSettings=ScatterChartSettings(
                            type=ChartType.scatter,
                            xAxisLog=True,
                        ),
                        changedSettings=["xAxisLog"],
                    )
                ),
            )
        finally:
            manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]
            manager._schedule_deferred_codegen_refresh = (
                original_schedule_deferred_refresh  # type: ignore[method-assign]
            )
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        stale_chat_id = await manager.get_chat_section_chat_id(
            GetChatSectionChatIdRequest(
                projectConfigId=project_config_id,
                sectionId=chat_section_id,
            )
        )
        assert stale_chat_id is None


@pytest.mark.asyncio
async def test_show_param_display_names_routes_use_project_config_patch_transport() -> (
    None
):
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(20)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        project_config_patch_calls: list[dict[str, int | str | list[str]]] = []
        original_project_state_broadcast = sender.broadcast_project_state
        original_project_config_patch_broadcast = (
            sender.broadcast_project_state_project_config_patch
        )

        async def record_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision=None,
        ) -> None:
            nonlocal project_state_broadcast_calls
            project_state_broadcast_calls += 1
            await original_project_state_broadcast(
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
                    "showParamDisplayNames": project_config_for_patch.showParamDisplayNames,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
                    "completedOpIds": list(completed_op_ids),
                    "pendingOpIds": list(pending_op_ids),
                }
            )
            await original_project_config_patch_broadcast(
                project_config_id_for_patch,
                project_config_for_patch,
                previous_project_state_revision,
                project_state_revision,
                completed_op_ids,
                pending_op_ids,
            )

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_project_config_patch = (
            record_project_config_patch  # type: ignore[method-assign]
        )
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_snapshot_calls = project_state_broadcast_calls
            before_patch_count = len(project_config_patch_calls)
            await manager.set_show_param_display_names(
                SetShowParamDisplayNamesRequest(
                    projectConfigId=project_config_id,
                    showParamDisplayNames=True,
                )
            )
            await manager.compare_and_set_show_param_display_names(
                SetShowParamDisplayNamesRequest(
                    projectConfigId=project_config_id,
                    showParamDisplayNames=False,
                ),
                expected_old_value=True,
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_project_config_patch = (
                original_project_config_patch_broadcast  # type: ignore[method-assign]
            )

        assert project_state_broadcast_calls == before_snapshot_calls
        patches = project_config_patch_calls[before_patch_count:]
        assert len(patches) == 2
        first_patch = patches[0]
        assert first_patch["projectConfigId"] == project_config_id
        assert first_patch["showParamDisplayNames"] is True
        assert (
            first_patch["previousProjectStateRevision"]
            < first_patch["projectStateRevision"]
        )
        second_patch = patches[1]
        assert second_patch["projectConfigId"] == project_config_id
        assert second_patch["showParamDisplayNames"] is False
        assert (
            second_patch["previousProjectStateRevision"]
            < second_patch["projectStateRevision"]
        )
