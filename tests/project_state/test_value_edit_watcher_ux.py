import pytest

from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetCodeRequest,
    SetPromptFormatRequest,
    SetPromptInputsRequest,
    SetPromptTemplateRequest,
    SetTextBlockTextRequest,
)
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.prompt import PromptFormat
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    PromptSectionImpl,
    SectionType,
    TextBlockSectionImpl,
)
from tests.code_gen.test_code_generator_formatting import build_callable_project_state
from tests.utils.manager_fixture import real_settings_manager


ROUTE_NAMES = (
    "set_code",
    "set_text_block_text",
    "set_prompt_template",
    "set_prompt_inputs",
    "set_prompt_format",
)


def _snapshot_watcher_paths(manager) -> dict[str, set[str]]:
    snapshots: dict[str, set[str]] = {}
    callbacks = manager.specific_file_watcher.callbacks
    for category, callback_map in callbacks.items():
        snapshots[category] = {str(path) for path in callback_map}
    return snapshots


async def _assert_skips_file_watcher_refresh_calls(manager, operation_coro) -> None:
    json_source_watch_calls = 0
    artifact_watch_calls = 0
    code_watch_calls = 0
    watch_code_sync_calls = 0
    refresh_calls = 0

    original_watch_json_source_files = manager.watch_json_source_files
    original_watch_artifact_files = manager.watch_artifact_files
    original_watch_code_files = manager.watch_code_files
    original_watch_code_sync = manager.watch_code_manager.sync_from_backend
    original_refresh = manager._refresh_codegen_state

    def record_watch_json_source_files() -> None:
        nonlocal json_source_watch_calls
        json_source_watch_calls += 1
        original_watch_json_source_files()

    def record_watch_artifact_files() -> None:
        nonlocal artifact_watch_calls
        artifact_watch_calls += 1
        original_watch_artifact_files()

    def record_watch_code_files(*args, **kwargs) -> None:
        nonlocal code_watch_calls
        code_watch_calls += 1
        original_watch_code_files(*args, **kwargs)

    def record_watch_code_sync(backend) -> None:
        nonlocal watch_code_sync_calls
        watch_code_sync_calls += 1
        original_watch_code_sync(backend)

    async def record_refresh(next_state):
        nonlocal refresh_calls
        refresh_calls += 1
        await original_refresh(next_state)

    manager.watch_json_source_files = record_watch_json_source_files  # type: ignore[method-assign]
    manager.watch_artifact_files = record_watch_artifact_files  # type: ignore[method-assign]
    manager.watch_code_files = record_watch_code_files  # type: ignore[method-assign]
    manager.watch_code_manager.sync_from_backend = record_watch_code_sync  # type: ignore[method-assign]
    manager._refresh_codegen_state = record_refresh  # type: ignore[method-assign]
    try:
        await manager.finish_pending_operations(timeout=5.0)
        before_json = json_source_watch_calls
        before_artifact = artifact_watch_calls
        before_code = code_watch_calls
        before_sync = watch_code_sync_calls
        before_refresh = refresh_calls
        await operation_coro
        await manager.finish_pending_operations(timeout=5.0)
    finally:
        manager.watch_json_source_files = original_watch_json_source_files  # type: ignore[method-assign]
        manager.watch_artifact_files = original_watch_artifact_files  # type: ignore[method-assign]
        manager.watch_code_files = original_watch_code_files  # type: ignore[method-assign]
        manager.watch_code_manager.sync_from_backend = original_watch_code_sync  # type: ignore[method-assign]
        manager._refresh_codegen_state = original_refresh  # type: ignore[method-assign]

    assert json_source_watch_calls - before_json == 0
    assert artifact_watch_calls - before_artifact == 0
    assert code_watch_calls - before_code == 0
    assert watch_code_sync_calls - before_sync == 0
    assert refresh_calls - before_refresh > 0


async def _create_value_edit_sections(
    manager,
    project_config_id,
) -> tuple[str, str, str]:
    code_section_id = (
        await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Code,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
    ).sectionId
    text_section_id = (
        await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.TextBlock,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
    ).sectionId
    prompt_section_id = (
        await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Prompt,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
    ).sectionId
    return code_section_id, text_section_id, prompt_section_id


async def _prepare_route_state(
    manager,
    project_config_id: str,
    prompt_section_id: str,
    route_name: str,
) -> None:
    # Prompt inputs/format operations need an existing template to produce stable output.
    if route_name in {"set_prompt_inputs", "set_prompt_format"}:
        await manager.set_prompt_template(
            SetPromptTemplateRequest(
                projectConfigId=project_config_id,
                sectionId=prompt_section_id,
                template="Hello {{ value }}",
            )
        )
    if route_name == "set_prompt_format":
        await manager.set_prompt_inputs(
            SetPromptInputsRequest(
                projectConfigId=project_config_id,
                sectionId=prompt_section_id,
                inputs={"value": "before"},
            )
        )
    await manager.finish_pending_operations(timeout=5.0)


async def _run_route(
    manager,
    project_config_id: str,
    code_section_id: str,
    text_section_id: str,
    prompt_section_id: str,
    route_name: str,
) -> None:
    if route_name == "set_code":
        await manager.set_code(
            SetCodeRequest(
                projectConfigId=project_config_id,
                sectionId=code_section_id,
                code="def compute(value: int) -> int:\n    return value + 7\n",
            )
        )
        return
    if route_name == "set_text_block_text":
        await manager.set_text_block_text(
            SetTextBlockTextRequest(
                projectConfigId=project_config_id,
                sectionId=text_section_id,
                text="# Fresh heading\nBody line",
            )
        )
        return
    if route_name == "set_prompt_template":
        await manager.set_prompt_template(
            SetPromptTemplateRequest(
                projectConfigId=project_config_id,
                sectionId=prompt_section_id,
                template="Greeting: {{ value }}",
            )
        )
        return
    if route_name == "set_prompt_inputs":
        await manager.set_prompt_inputs(
            SetPromptInputsRequest(
                projectConfigId=project_config_id,
                sectionId=prompt_section_id,
                inputs={"value": "new value"},
            )
        )
        return
    if route_name == "set_prompt_format":
        await manager.set_prompt_format(
            SetPromptFormatRequest(
                projectConfigId=project_config_id,
                sectionId=prompt_section_id,
                format=PromptFormat.Jinja,
            )
        )
        return
    raise ValueError(f"Unsupported route {route_name}")


def _assert_route_mutation(
    manager,
    project_config_id: str,
    code_section_id: str,
    text_section_id: str,
    prompt_section_id: str,
    route_name: str,
) -> None:
    project_state = manager.get_single_config_state(project_config_id)
    if route_name == "set_code":
        code_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            code_section_id,
            BaseCodeSectionImpl,
        )
        assert (
            code_impl.code == "def compute(value: int) -> int:\n    return value + 7\n"
        )
        return
    if route_name == "set_text_block_text":
        text_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            text_section_id,
            TextBlockSectionImpl,
        )
        assert text_impl.text == "# Fresh heading\nBody line"
        return
    prompt_impl = get_curr_effective_section_impl_with_type_guard(
        project_state,
        prompt_section_id,
        PromptSectionImpl,
    )
    if route_name == "set_prompt_template":
        assert prompt_impl.template == "Greeting: {{ value }}"
        return
    if route_name == "set_prompt_inputs":
        assert prompt_impl.inputs == {"value": "new value"}
        assert prompt_impl.renderedText == "Hello new value"
        assert prompt_impl.renderError is None
        return
    if route_name == "set_prompt_format":
        assert prompt_impl.format == PromptFormat.Jinja
        assert prompt_impl.renderedText == "Hello before"
        assert prompt_impl.renderError is None
        return
    raise ValueError(f"Unsupported route {route_name}")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("route_name", "expected_name_validation_delta"),
    [
        ("set_code", 0),
        ("set_text_block_text", 1),
        ("set_prompt_template", 1),
        ("set_prompt_inputs", 1),
        ("set_prompt_format", 1),
    ],
)
async def test_value_edit_routes_preserve_broadcast_shape_and_mutation(
    route_name: str,
    expected_name_validation_delta: int,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        (
            code_section_id,
            text_section_id,
            prompt_section_id,
        ) = await _create_value_edit_sections(manager, project_config_id)
        await _prepare_route_state(
            manager,
            project_config_id,
            prompt_section_id,
            route_name,
        )

        sender = manager.websocket_msg_handler
        project_state_broadcast_calls = 0
        section_impl_patch_calls: list[dict[str, int | str]] = []
        name_validation_broadcast_calls = 0
        original_project_state_broadcast = sender.broadcast_project_state
        original_section_impl_patch_broadcast = (
            sender.broadcast_project_state_section_impl_patch
        )
        original_name_validation_broadcast = sender.broadcast_name_validation_errors

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
                    "sectionImplId": section_impl_for_patch.id,
                    "previousProjectStateRevision": previous_project_state_revision,
                    "projectStateRevision": project_state_revision,
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

        sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_section_impl_patch = (
            record_section_impl_patch  # type: ignore[method-assign]
        )
        sender.broadcast_name_validation_errors = record_name_validation_broadcast  # type: ignore[method-assign]
        try:
            await manager.finish_pending_operations(timeout=5.0)
            before_project_state = project_state_broadcast_calls
            before_section_patch_count = len(section_impl_patch_calls)
            before_name_validation = name_validation_broadcast_calls
            await _run_route(
                manager,
                project_config_id,
                code_section_id,
                text_section_id,
                prompt_section_id,
                route_name,
            )
            await manager.finish_pending_operations(timeout=5.0)
        finally:
            sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
            sender.broadcast_project_state_section_impl_patch = (
                original_section_impl_patch_broadcast  # type: ignore[method-assign]
            )
            sender.broadcast_name_validation_errors = original_name_validation_broadcast  # type: ignore[method-assign]

        if route_name == "set_code":
            expected_primary_section_id = code_section_id
        elif route_name == "set_text_block_text":
            expected_primary_section_id = text_section_id
        else:
            expected_primary_section_id = prompt_section_id

        # Value-edit routes should now use section-impl patch transport.
        assert project_state_broadcast_calls - before_project_state == 0
        patches = section_impl_patch_calls[before_section_patch_count:]
        assert len(patches) >= 1
        assert patches[0]["projectConfigId"] == project_config_id
        assert (
            patches[0]["previousProjectStateRevision"]
            < patches[0]["projectStateRevision"]
        )
        for patch in patches[1:]:
            assert patch["projectConfigId"] == project_config_id
            assert patch["projectStateRevision"] == patches[0]["projectStateRevision"]
            assert (
                patch["previousProjectStateRevision"]
                == patches[0]["projectStateRevision"]
            )
        assert any(
            patch["sectionId"] == expected_primary_section_id for patch in patches
        )
        assert (
            name_validation_broadcast_calls - before_name_validation
            == expected_name_validation_delta
        )
        _assert_route_mutation(
            manager,
            project_config_id,
            code_section_id,
            text_section_id,
            prompt_section_id,
            route_name,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("route_name", ROUTE_NAMES)
async def test_value_edit_routes_preserve_watcher_path_registration(
    route_name: str,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        (
            code_section_id,
            text_section_id,
            prompt_section_id,
        ) = await _create_value_edit_sections(manager, project_config_id)
        await _prepare_route_state(
            manager,
            project_config_id,
            prompt_section_id,
            route_name,
        )

        await manager.finish_pending_operations(timeout=5.0)
        before_paths = _snapshot_watcher_paths(manager)
        await _run_route(
            manager,
            project_config_id,
            code_section_id,
            text_section_id,
            prompt_section_id,
            route_name,
        )
        await manager.finish_pending_operations(timeout=5.0)

        after_paths = _snapshot_watcher_paths(manager)
        assert after_paths == before_paths


@pytest.mark.asyncio
@pytest.mark.parametrize("route_name", ROUTE_NAMES)
async def test_value_edit_routes_skip_file_watcher_refresh_calls(
    route_name: str,
) -> None:
    async with real_settings_manager() as fixture:
        manager = fixture.manager
        manager.settings_file.settings.backend.autosave = False
        project_state = build_callable_project_state(4)
        await manager.update(project_state, updateFileWatcher=True)
        project_config_id = project_state.projectConfig.id
        (
            code_section_id,
            text_section_id,
            prompt_section_id,
        ) = await _create_value_edit_sections(manager, project_config_id)
        await _prepare_route_state(
            manager,
            project_config_id,
            prompt_section_id,
            route_name,
        )

        await _assert_skips_file_watcher_refresh_calls(
            manager,
            _run_route(
                manager,
                project_config_id,
                code_section_id,
                text_section_id,
                prompt_section_id,
                route_name,
            ),
        )
