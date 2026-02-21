import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from pydantic import BaseModel

from setta.mcp.tools.ui_settings import (
    get_ui_setting_value,
    reveal_ui_setting,
    search_ui_settings,
    set_ui_setting_value,
)
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    SetActiveIdsRequest,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.plugins.manager import PluginManager
from setta.types.id import ID
from setta.types.section_impls import SectionType

from tests.utils.manager_fixture import real_project_manager, real_settings_manager

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


class _RecordingFrontendSender:
    def __init__(self) -> None:
        self.reveal_messages: list[tuple[object, str | None]] = []

    async def broadcast_ui_setting_reveal(
        self,
        content,
        *,
        share_session_id: str | None = None,
    ) -> None:
        self.reveal_messages.append((content, share_session_id))


class _RequestMetaModel(BaseModel):
    projectConfigId: ID


def _build_ctx(
    *,
    main_manager,
    settings_manager,
    frontend_sender: _RecordingFrontendSender,
    plugin_manager: PluginManager | None = None,
    request_meta: BaseModel | dict[str, object] | None = None,
) -> Context:
    switcher = ProjectManagerSwitcher(
        main_manager=main_manager,
        settings_manager=settings_manager,
    )
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=frontend_sender,
        plugin_manager=plugin_manager,
    )
    if request_meta is None:
        return Context(fastmcp=SimpleNamespace(state=state))
    request_context = RequestContext(
        request_id="test-request-id",
        meta=request_meta,
        session=object(),
        lifespan_context=object(),
        request=None,
    )
    return Context(
        fastmcp=SimpleNamespace(state=state),
        request_context=request_context,
    )


def _build_plugin_manager(tmp_path: Path) -> PluginManager:
    workspace_root = tmp_path / "workspace"
    setta_files_root = tmp_path / "setta_files"
    setta_home = tmp_path / "setta_home"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_files_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)
    return PluginManager(
        workspace_root=workspace_root,
        setta_files_root=setta_files_root,
        setta_home=setta_home,
        server_mode="ide",
        setta_version="0.1.0",
    )


def _copy_fixture_plugin_to_workspace(
    *,
    manager: PluginManager,
    fixture_name: str,
) -> tuple[str, Path]:
    source_root = FIXTURE_PLUGIN_ROOT / fixture_name
    manifest_path = source_root / "setta.plugin.json"
    manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_id = manifest_payload["id"]
    destination_root = manager.workspace_root / ".setta_plugins" / plugin_id
    destination_root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source_root, destination_root)
    _prepare_fixture_frontend_dist(destination_root)
    return plugin_id, destination_root


def _prepare_fixture_frontend_dist(plugin_root: Path) -> None:
    frontend_root = plugin_root / "frontend"
    source_entrypoint = frontend_root / "src" / "index.js"
    if not source_entrypoint.is_file():
        return
    dist_root = frontend_root / "dist"
    dist_root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_entrypoint, dist_root / "index.js")
    source_style = frontend_root / "src" / "index.css"
    if source_style.is_file():
        shutil.copy2(source_style, dist_root / "index.css")


@pytest.mark.asyncio
async def test_ui_setting_tools_core_flow() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        search_result = search_ui_settings(
            query="watch code toggle",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        result_ids = [entry.settingId for entry in search_result.results]
        assert "core.watch_code.enabled" in result_ids

        get_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert get_result.value in {True, False}

        original_value = bool(get_result.value)
        target_value = not original_value
        set_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=target_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is True
        assert set_result.newValue == target_value

        revert_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=original_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert revert_result.error is None
        assert revert_result.newValue == original_value

        reveal_result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert frontend_sender.reveal_messages
        reveal_content, reveal_share_session_id = frontend_sender.reveal_messages[0]
        assert reveal_share_session_id is None
        assert reveal_content.reveals[0].settingId == "core.watch_code.enabled"


@pytest.mark.asyncio
async def test_set_ui_setting_value_returns_structured_validation_error() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value="not-a-boolean",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "invalid_value_type"
        assert result.changed is False


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_requires_active_section_or_override() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Right-pane reveals require a section context when none is active.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "sectionIdToActivate" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_activates_section_from_argument() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        create_result = await manager.create_top_level_section(
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
        section_id = create_result.sectionId

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[],
            )
        )

        # sectionIdToActivate allows right-pane reveal to choose the section context.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "revealed"
        assert result.statuses[0].target is not None
        assert result.statuses[0].target.settingId == "core.project.show_param_display_names"

        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.reveals[0].settingId == "core.project.show_param_display_names"


@pytest.mark.asyncio
async def test_reveal_right_pane_uses_model_request_meta_project_config_id() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        old_default_project_config_id = ID(
            manager.project_state_backend.defaultProjectConfigId
        )
        existing_project_config_ids = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        await manager.create_project_config("bg-blue-500/60 dark:bg-blue-600/30")
        project_config_ids_after_create = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        new_project_config_ids = (
            project_config_ids_after_create - existing_project_config_ids
        )
        assert len(new_project_config_ids) == 1
        created_project_config_id = ID(next(iter(new_project_config_ids)))
        current_default_project_config_id = ID(
            manager.project_state_backend.defaultProjectConfigId
        )
        target_project_config_id = (
            old_default_project_config_id
            if current_default_project_config_id == created_project_config_id
            else created_project_config_id
        )

        create_result = await manager.create_top_level_section(
            CreateTopLevelSectionRequest(
                projectConfigId=target_project_config_id,
                implType=SectionType.Dict,
                controlCodeObjType=None,
                implOverrides=None,
                position=None,
                topLevelSections=None,
                viewportBounds=None,
            )
        )
        section_id = create_result.sectionId

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=target_project_config_id,
                activeIds=[],
            )
        )
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta=_RequestMetaModel(projectConfigId=target_project_config_id),
        )

        # MCP /__setta__/tools/call passes model meta; reveal must respect that project.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "revealed"

        updated_state = manager.get_single_config_state(target_project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_fails_for_unknown_section_override() -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Unknown section IDs should fail before reveal emission.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=ID("missing-section"),
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "Unknown section id" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_plugin_ui_setting_flow_from_config_schema_metadata(
    tmp_path: Path,
) -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, _ = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )

        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            plugin_manager=plugin_manager,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        plugin_setting_id = f"plugin::{plugin_id}::enabled"

        # Plugin settings declared in config schema should be discoverable via search.
        search_result = search_ui_settings(
            query="full fixture enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        result_ids = [entry.settingId for entry in search_result.results]
        assert plugin_setting_id in result_ids

        # Plugin settings should support read and write through plugin config persistence.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert get_result.value is False

        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is True
        assert set_result.newValue is True

        runtime_response = plugin_manager.get_runtime_response()
        plugin_entry = next(
            entry for entry in runtime_response.list.plugins if entry.pluginId == plugin_id
        )
        assert plugin_entry.config.currentConfig["enabled"] is True

        # Reveal should resolve to plugin pane + plugin reveal handler metadata.
        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert len(reveal_result.statuses) == 1
        assert reveal_result.statuses[0].status == "revealed"
        assert reveal_result.statuses[0].target is not None
        target = reveal_result.statuses[0].target
        assert target is not None
        assert target.strategy == "plugin_handler"
        assert target.pluginId == plugin_id
        assert target.paneId == "full-settings-pane"
        assert target.pluginRevealKey == "full-settings"
        assert target.overviewTabKey == "PluginPane:setta-fixture-full:full-settings-pane"
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_plugin_ui_setting_returns_plugin_unavailable_when_disabled(
    tmp_path: Path,
) -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, _ = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        plugin_manager.disable_plugin(plugin_id=plugin_id)

        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            plugin_manager=plugin_manager,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        plugin_setting_id = f"plugin::{plugin_id}::enabled"

        # Disabled plugin settings should report plugin_unavailable consistently.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"

        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=False,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "plugin_unavailable"

        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 0
        assert len(reveal_result.statuses) == 1
        assert reveal_result.statuses[0].error is not None
        assert reveal_result.statuses[0].error.code == "plugin_unavailable"


@pytest.mark.asyncio
async def test_plugin_ui_setting_returns_plugin_unavailable_when_register_pane_not_effective(
    tmp_path: Path,
) -> None:
    async with real_project_manager() as project_fixture, real_settings_manager() as settings_fixture:
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        manifest_path = plugin_root / "setta.plugin.json"
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_payload["capabilities"] = ["registerSectionKinds", "registerCommand"]
        manifest_path.write_text(
            json.dumps(manifest_payload, indent=2) + "\n",
            encoding="utf-8",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )

        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            plugin_manager=plugin_manager,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        plugin_setting_id = f"plugin::{plugin_id}::enabled"

        # Plugin IDs should report capability-gated unavailability for UI setting tools.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert "registerPane capability not effective" in get_result.error.message

        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "plugin_unavailable"
        assert "registerPane capability not effective" in set_result.error.message

        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 0
        assert len(reveal_result.statuses) == 1
        assert reveal_result.statuses[0].status == "failed"
        assert reveal_result.statuses[0].error is not None
        assert reveal_result.statuses[0].error.code == "plugin_unavailable"
        assert (
            "registerPane capability not effective"
            in reveal_result.statuses[0].error.message
        )
