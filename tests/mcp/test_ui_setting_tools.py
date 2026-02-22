import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from pydantic import BaseModel

import setta.mcp.tools.ui_settings as ui_settings_tools_module
from setta.mcp.tools.ui_settings import (
    get_ui_setting_value,
    reveal_ui_setting,
    search_ui_settings,
    set_ui_setting_value,
)
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    GetAppDefinitionRequest,
    SetActiveIdsRequest,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.plugins.manager import PluginManager
from setta.types.id import ID
from setta.types.section_impls import SectionType
from setta.ui_settings.reveal_result_hub import (
    UISettingRevealResultContent,
    UISettingRevealResultHub,
    UISettingRevealResultStatus,
)
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingHighlight,
    UISettingLocation,
    UISettingMutationResult,
    UISettingRuntimeEntry,
    UISettingValueSchema,
)
from setta.ui_settings.registry import _build_plugin_pane_overview_tab_key

from tests.utils.manager_fixture import real_project_manager, real_settings_manager

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


def test_plugin_pane_overview_tab_key_matches_encode_uri_component_rules() -> None:
    assert (
        _build_plugin_pane_overview_tab_key(
            plugin_id="plugin!~*'() /",
            pane_id="pane!~*'() :?",
        )
        == "PluginPane:plugin!~*'()%20%2F:pane!~*'()%20%3A%3F"
    )


class _RecordingFrontendSender:
    def __init__(
        self, *, reveal_result_hub: UISettingRevealResultHub | None = None
    ) -> None:
        self.reveal_messages: list[tuple[object, str | None]] = []
        self.reveal_result_hub = (
            reveal_result_hub
            if reveal_result_hub is not None
            else UISettingRevealResultHub()
        )
        self.forced_status_by_setting_id: dict[str, UISettingRevealResultStatus] = {}
        self.reveal_target_websocket_id: str | None = "frontend-test"
        self.connected_frontend_websocket_ids: list[str] = ["frontend-test"]
        self.resolved_target_websocket_ids: list[str] = []

    def select_frontend_websocket_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002 - signature parity
        preferred_websocket_id: str | None = None,
    ) -> str | None:
        if preferred_websocket_id is not None:
            if preferred_websocket_id in self.connected_frontend_websocket_ids:
                return preferred_websocket_id
            return None
        if self.reveal_target_websocket_id is not None:
            return self.reveal_target_websocket_id
        if not self.connected_frontend_websocket_ids:
            return None
        return sorted(self.connected_frontend_websocket_ids)[0]

    def list_frontend_websocket_ids_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002 - signature parity
    ) -> list[str]:
        return sorted(self.connected_frontend_websocket_ids)

    async def broadcast_ui_setting_reveal(
        self,
        content,
        *,
        share_session_id: str | None = None,
        target_websocket_id: str | None = None,
    ) -> str | None:
        resolved_target_websocket_id = target_websocket_id
        if resolved_target_websocket_id is None:
            resolved_target_websocket_id = (
                self.select_frontend_websocket_for_ui_setting_reveal(
                    share_session_id=share_session_id
                )
            )
        if resolved_target_websocket_id is None:
            return None
        self.resolved_target_websocket_ids.append(resolved_target_websocket_id)
        self.reveal_messages.append((content, share_session_id))
        statuses: list[UISettingRevealResultStatus] = []
        for target in content.reveals:
            forced_status = self.forced_status_by_setting_id.get(target.settingId)
            if forced_status is not None:
                statuses.append(forced_status)
                continue
            statuses.append(
                UISettingRevealResultStatus(
                    settingId=target.settingId,
                    status="revealed",
                    errorCode=None,
                    errorMessage=None,
                )
            )
        self.reveal_result_hub.resolve(
            UISettingRevealResultContent(
                projectConfigId=content.projectConfigId,
                requestId=content.requestId,
                statuses=statuses,
            ),
            from_websocket_id=resolved_target_websocket_id,
        )
        return resolved_target_websocket_id


class _RequestMetaModel(BaseModel):
    projectConfigId: ID
    sectionId: ID | None = None
    frontendWebsocketId: str | None = None


def _build_ctx(
    *,
    main_manager,
    settings_manager,
    frontend_sender: _RecordingFrontendSender,
    plugin_manager: PluginManager | None = None,
    dbe=None,
    agent_runner=None,
    request_meta: BaseModel | dict[str, object] | None = None,
) -> Context:
    reveal_result_hub = UISettingRevealResultHub()
    frontend_sender.reveal_result_hub = reveal_result_hub
    switcher = ProjectManagerSwitcher(
        main_manager=main_manager,
        settings_manager=settings_manager,
    )
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=frontend_sender,
        plugin_manager=plugin_manager,
        ui_setting_reveal_result_hub=reveal_result_hub,
        dbe=dbe,
        agent_runner=agent_runner,
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


def _copy_fixture_plugin_to_setta_files(
    *,
    manager: PluginManager,
    fixture_name: str,
) -> tuple[str, Path]:
    source_root = FIXTURE_PLUGIN_ROOT / fixture_name
    manifest_path = source_root / "setta.plugin.json"
    manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_id = manifest_payload["id"]
    destination_root = manager.setta_files_root / "plugins" / plugin_id
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
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
async def test_set_ui_setting_value_rejects_writer_old_value_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _read_value(_ctx: Context, _project_config_id: ID) -> bool:
        return False

    async def _write_value(
        _ctx: Context,
        _project_config_id: ID,
        _value: bool,
    ) -> UISettingMutationResult:
        return UISettingMutationResult(
            oldValue=True,
            newValue=True,
            normalizedValue=True,
            changed=True,
        )

    runtime_entry = UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId="core.test.flag",
            title="Test Flag",
            description="Validates old-value drift handling.",
            source="core",
            mutability="writable",
            location=UISettingLocation(side="left", overviewTabKey="Overview"),
            highlight=UISettingHighlight(
                strategy="dom_anchor",
                anchorId="core.test.flag",
            ),
            valueSchema=UISettingValueSchema(type="boolean"),
        ),
        readValue=_read_value,
        writeValue=_write_value,
    )

    class _FakeRegistry:
        def __init__(self) -> None:
            self.pluginErrorsByPluginId: dict[str, str] = {}

        def get(self, setting_id: str) -> UISettingRuntimeEntry | None:
            if setting_id == "core.test.flag":
                return runtime_entry
            return None

    monkeypatch.setattr(
        ui_settings_tools_module,
        "build_ui_settings_registry",
        lambda *, ctx, project_config_id: _FakeRegistry(),
    )

    # Writer responses must match the validated pre-write snapshot.
    result = await set_ui_setting_value(
        settingId="core.test.flag",
        value=True,
        projectConfigId=ID("project-1"),
        ctx=Context(
            fastmcp=SimpleNamespace(
                state=SimpleNamespace(project_manager_switcher=SimpleNamespace(main=None))
            )
        ),
    )

    assert result.error is not None
    assert result.error.code == "mutation_failed"
    assert "oldValue that does not match the validated pre-write snapshot" in (
        result.error.message
    )
    assert result.newValue is None
    assert result.changed is False


@pytest.mark.asyncio
async def test_ui_setting_tools_normalize_setting_id_whitespace() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        padded_setting_id = "  core.watch_code.enabled\t"

        initial_get_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert initial_get_result.error is None
        assert isinstance(initial_get_result.value, bool)
        original_value = initial_get_result.value
        target_value = not original_value

        padded_get_result = await get_ui_setting_value(
            settingId=padded_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert padded_get_result.error is None
        assert padded_get_result.value == original_value

        padded_set_result = await set_ui_setting_value(
            settingId=padded_setting_id,
            value=target_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert padded_set_result.error is None
        assert padded_set_result.newValue == target_value

        padded_reveal_result = await reveal_ui_setting(
            settingId=padded_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert padded_reveal_result.emittedRevealCount == 1
        assert padded_reveal_result.statuses[0].status == "revealed"

        revert_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=original_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert revert_result.error is None
        assert revert_result.newValue == original_value


@pytest.mark.asyncio
@pytest.mark.parametrize("tool_name", ["reveal", "get", "set"])
async def test_ui_setting_tools_reject_whitespace_only_setting_id(
    tool_name: str,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        with pytest.raises(ValueError, match="settingId must not be empty."):
            if tool_name == "reveal":
                await reveal_ui_setting(
                    settingId=" \t ",
                    projectConfigId=project_config_id,
                    ctx=ctx,
                )
            elif tool_name == "get":
                await get_ui_setting_value(
                    settingId=" \t ",
                    projectConfigId=project_config_id,
                    ctx=ctx,
                )
            elif tool_name == "set":
                await set_ui_setting_value(
                    settingId=" \t ",
                    value=True,
                    projectConfigId=project_config_id,
                    ctx=ctx,
                )
            else:
                raise ValueError(f"Unsupported tool in parameterized test: {tool_name}")


@pytest.mark.asyncio
async def test_project_ai_settings_are_discoverable_revealable_and_read_only() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            dbe=project_fixture.dbe,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        entries = [
            ("core.project_ai_settings.llm_api_keys", "llm api keys"),
            ("core.project_ai_settings.agent_profiles", "agent profiles"),
            ("core.project_ai_settings.prompt_templates", "prompt templates"),
            ("core.project_ai_settings.external_agents", "external agents"),
        ]
        expected_activation_step_by_setting_id = {
            "core.project_ai_settings.llm_api_keys": (
                "project_ai_settings_accordion_item",
                "project-ai-settings-llm-api-keys",
            ),
            "core.project_ai_settings.agent_profiles": (
                "project_ai_settings_accordion_item",
                "project-ai-settings-agent-profiles",
            ),
            "core.project_ai_settings.prompt_templates": (
                "project_ai_settings_accordion_item",
                "project-ai-settings-prompt-templates",
            ),
            "core.project_ai_settings.external_agents": (
                "project_ai_settings_accordion_item",
                "project-ai-settings-external-agents",
            ),
        }

        for setting_id, query in entries:
            search_result = search_ui_settings(
                query=query,
                sourceFilter="core",
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            result_ids = [entry.settingId for entry in search_result.results]
            assert setting_id in result_ids

            get_result = await get_ui_setting_value(
                settingId=setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert get_result.error is None
            assert isinstance(get_result.value, int)
            assert get_result.value >= 0

            set_result = await set_ui_setting_value(
                settingId=setting_id,
                value=0,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert set_result.error is not None
            assert set_result.error.code == "setting_read_only"

            reveal_result = await reveal_ui_setting(
                settingId=setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert reveal_result.emittedRevealCount == 1
            assert len(reveal_result.statuses) == 1
            assert reveal_result.statuses[0].status == "revealed"
            assert reveal_result.statuses[0].target is not None
            target = reveal_result.statuses[0].target
            assert target is not None
            assert target.overviewTabKey == "ProjectAISettings"
            expected_activation = expected_activation_step_by_setting_id.get(setting_id)
            if expected_activation is None:
                assert target.revealActivationSteps == []
            else:
                assert len(target.revealActivationSteps) == 1
                assert target.revealActivationSteps[0].type == expected_activation[0]
                assert (
                    target.revealActivationSteps[0].itemValue == expected_activation[1]
                )


@pytest.mark.asyncio
async def test_project_name_setting_round_trip() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        get_result = await get_ui_setting_value(
            settingId="core.project.name",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert isinstance(get_result.value, str)
        original_name = get_result.value
        next_name = f"{original_name}-renamed"

        set_result = await set_ui_setting_value(
            settingId="core.project.name",
            value=next_name,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is True
        assert set_result.newValue == next_name

        revert_result = await set_ui_setting_value(
            settingId="core.project.name",
            value=original_name,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert revert_result.error is None
        assert revert_result.newValue == original_name


@pytest.mark.asyncio
async def test_python_codegen_enabled_setting_round_trip() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        initial_result = await get_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert initial_result.error is None
        assert isinstance(initial_result.value, bool)
        original_value = initial_result.value
        target_value = not original_value

        set_result = await set_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            value=target_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is True
        assert set_result.newValue == target_value

        updated_result = await get_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_result.error is None
        assert updated_result.value == target_value

        reveal_result = await reveal_ui_setting(
            settingId="core.run_instructions.python_codegen_enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert reveal_result.statuses[0].status == "revealed"
        target = reveal_result.statuses[0].target
        assert target is not None
        assert target.overviewTabKey == "RunInstructions"
        assert len(target.revealActivationSteps) == 1
        assert target.revealActivationSteps[0].type == "run_instructions_accordion_item"
        assert (
            target.revealActivationSteps[0].itemValue
            == "run-instructions-codegen-targets"
        )

        revert_result = await set_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            value=original_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert revert_result.error is None
        assert revert_result.newValue == original_value


@pytest.mark.asyncio
async def test_app_spec_path_read_and_write_are_schema_consistent_on_fresh_project() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        initial_get_result = await get_ui_setting_value(
            settingId="core.app.spec_path",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert initial_get_result.error is None
        assert isinstance(initial_get_result.value, str)
        assert initial_get_result.value.strip() != ""

        next_spec_path = "app_specs/ui-settings-test-app.json"
        set_result = await set_ui_setting_value(
            settingId="core.app.spec_path",
            value=next_spec_path,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.newValue == next_spec_path

        updated_get_result = await get_ui_setting_value(
            settingId="core.app.spec_path",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_get_result.error is None
        assert updated_get_result.value == next_spec_path

        app_definition_response = await manager.get_app_definition(
            GetAppDefinitionRequest()
        )
        assert isinstance(app_definition_response.appSpec, dict)
        assert app_definition_response.appDefinition is not None
        assert app_definition_response.appDefinition.appSpecPath == next_spec_path


@pytest.mark.asyncio
async def test_reveal_right_pane_setting_requires_active_section_or_override() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
        assert (
            result.statuses[0].target.settingId
            == "core.project.show_param_display_names"
        )

        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert (
            reveal_content.reveals[0].settingId
            == "core.project.show_param_display_names"
        )


@pytest.mark.asyncio
async def test_reveal_right_pane_incompatible_tab_does_not_mutate_active_section() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        create_result = await manager.create_top_level_section(
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
        incompatible_section_id = create_result.sectionId
        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[],
            )
        )
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )

        # Incompatible right-pane tabs must fail before section activation.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=incompatible_section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert (
            "Section type Code does not support tab QuickInfoConfig."
            in result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_set_ui_setting_value_reveal_after_set_uses_request_meta_section_id() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
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
        current_value_result = await get_ui_setting_value(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=_build_ctx(
                main_manager=manager,
                settings_manager=settings_fixture.manager,
                frontend_sender=frontend_sender,
            ),
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)
        target_value = not current_value_result.value

        # set_ui_setting_value(revealAfterSet=True) should reuse request-meta sectionId.
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta=_RequestMetaModel(
                projectConfigId=project_config_id,
                sectionId=section_id,
            ),
        )
        set_result = await set_ui_setting_value(
            settingId="core.project.show_param_display_names",
            value=target_value,
            revealAfterSet=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.reveal is not None
        assert set_result.reveal.emittedRevealCount == 1
        assert len(set_result.reveal.statuses) == 1
        assert set_result.reveal.statuses[0].status == "revealed"

        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [section_id]
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert (
            reveal_content.reveals[0].settingId
            == "core.project.show_param_display_names"
        )


@pytest.mark.asyncio
async def test_set_ui_setting_value_reveal_after_set_fails_without_section_context() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[],
            )
        )
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        current_value_result = await get_ui_setting_value(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)
        target_value = not current_value_result.value

        # Without explicit or request-meta section context, revealAfterSet should fail deterministically.
        set_result = await set_ui_setting_value(
            settingId="core.project.show_param_display_names",
            value=target_value,
            revealAfterSet=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.reveal is not None
        assert set_result.reveal.emittedRevealCount == 0
        assert len(set_result.reveal.statuses) == 1
        assert set_result.reveal.statuses[0].status == "failed"
        assert set_result.reveal.statuses[0].error is not None
        assert set_result.reveal.statuses[0].error.code == "mutation_failed"
        assert "sectionIdToActivate" in set_result.reveal.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_right_pane_uses_model_request_meta_project_config_id() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
async def test_reveal_ui_setting_returns_frontend_failure_status() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.forced_status_by_setting_id["core.watch_code.enabled"] = (
            UISettingRevealResultStatus(
                settingId="core.watch_code.enabled",
                status="failed",
                errorCode="mutation_failed",
                errorMessage="Anchor not found in active pane.",
            )
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "Anchor not found" in result.statuses[0].error.message


@pytest.mark.asyncio
async def test_reveal_ui_setting_returns_failure_when_no_frontend_is_connected() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.reveal_target_websocket_id = None
        frontend_sender.connected_frontend_websocket_ids = []
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Reveal requires at least one connected frontend target websocket.
        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert len(result.statuses) == 1
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "No connected frontend" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_when_multiple_frontends_exist_without_origin() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_websocket_ids = [
            "frontend-a",
            "frontend-b",
        ]
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Multi-frontend reveal requests must provide explicit origin routing metadata.
        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "multiple frontends are connected" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_ui_setting_prefers_frontend_websocket_id_from_request_meta() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_websocket_ids = [
            "frontend-a",
            "frontend-b",
        ]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendWebsocketId": "frontend-b",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        assert frontend_sender.resolved_target_websocket_ids[-1] == "frontend-b"


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_when_preferred_frontend_websocket_is_missing() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_websocket_ids = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendWebsocketId": "frontend-missing",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "frontend-missing" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_fast_when_reveal_result_hub_is_missing() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        switcher = ProjectManagerSwitcher(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
        )
        state = SimpleNamespace(
            project_manager_switcher=switcher,
            wmh_frontend_sender=frontend_sender,
            plugin_manager=None,
            dbe=None,
            agent_runner=None,
        )
        ctx = Context(fastmcp=SimpleNamespace(state=state))
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )

        # Reveal should never report success when the confirmation hub is missing.
        with pytest.raises((AttributeError, KeyError)):
            await reveal_ui_setting(
                settingId="core.watch_code.enabled",
                projectConfigId=project_config_id,
                ctx=ctx,
            )


@pytest.mark.asyncio
async def test_plugin_ui_settings_remain_discoverable_with_shadowed_scope_entries(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, _ = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        shadowed_plugin_id, _ = _copy_fixture_plugin_to_setta_files(
            manager=plugin_manager,
            fixture_name="full",
        )
        assert shadowed_plugin_id == plugin_id
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": True, "label": "shadowed"},
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

        # Active plugin settings should stay discoverable even when lower scopes are shadowed.
        runtime_response = plugin_manager.get_runtime_response()
        states = [
            entry.state.value
            for entry in runtime_response.status.plugins
            if entry.pluginId == plugin_id
        ]
        assert "active" in states
        assert "shadowed" in states

        search_result = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            limit=50,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        result_ids = [entry.settingId for entry in search_result.results]
        assert plugin_setting_id in result_ids

        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert get_result.value is True


@pytest.mark.asyncio
async def test_plugin_ui_setting_flow_from_config_schema_metadata(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
            entry
            for entry in runtime_response.list.plugins
            if entry.pluginId == plugin_id
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
        assert (
            target.overviewTabKey == "PluginPane:setta-fixture-full:full-settings-pane"
        )
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_plugin_backend_set_fails_before_write_when_existing_value_is_invalid(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        (plugin_root / "backend" / "entrypoint.py").write_text(
            "_STATE = {'enabled': 'invalid-before-write'}\n\n"
            "def _read_backend_enabled(*, project_config_id: str):\n"
            "    return _STATE['enabled']\n\n"
            "def _write_backend_enabled(*, project_config_id: str, value):\n"
            "    _STATE['enabled'] = bool(value)\n"
            "    return {'ok': True, 'projectConfigId': project_config_id}\n\n"
            "def register(plugin):\n"
            "    plugin.register_ui_setting(\n"
            "        {\n"
            "            'id': 'backend_enabled',\n"
            "            'title': 'Backend Enabled',\n"
            "            'description': 'Enable backend-provided fixture behavior.',\n"
            "            'paneId': 'full-settings-pane',\n"
            "            'revealKey': 'full-settings',\n"
            "            'synonyms': ['backend enabled'],\n"
            "            'mutability': 'writable',\n"
            "            'valueSchema': {'type': 'boolean'},\n"
            "            'read': _read_backend_enabled,\n"
            "            'write': _write_backend_enabled,\n"
            "        }\n"
            "    )\n",
            encoding="utf-8",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        plugin_manager.load_backend_plugins(app=FastAPI())

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
        plugin_setting_id = f"plugin::{plugin_id}::backend_enabled"

        try:
            set_result = await set_ui_setting_value(
                settingId=plugin_setting_id,
                value=True,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert set_result.error is not None
            assert set_result.error.code == "invalid_value_type"
            assert (
                "pre-write oldValue read returned an invalid value"
                in set_result.error.message
            )

            get_result = await get_ui_setting_value(
                settingId=plugin_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert get_result.error is not None
            assert get_result.error.code == "invalid_value_type"
        finally:
            plugin_manager.shutdown_backend_plugins()


@pytest.mark.asyncio
async def test_plugin_set_ui_setting_value_rejects_corrupt_config_root_without_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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

        runtime_response = plugin_manager.get_runtime_response()
        target_plugin = None
        for plugin_entry in runtime_response.list.plugins:
            if plugin_entry.pluginId == plugin_id:
                target_plugin = plugin_entry
                break
        if target_plugin is None:
            raise AssertionError("Expected runtime entry for full fixture plugin.")
        target_plugin.config.currentConfig = "invalid-root"
        monkeypatch.setattr(
            plugin_manager,
            "get_runtime_response",
            lambda: runtime_response,
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

        # Tool-level writes must fail on corrupt config roots without mutating config.
        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "mutation_failed"
        assert "config root must be an object" in set_result.error.message
        assert target_plugin.config.currentConfig == "invalid-root"


@pytest.mark.asyncio
async def test_plugin_schema_ui_setting_errors_do_not_break_core_settings(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        schema_path = plugin_root / "content" / "config" / "schema.json"
        schema_payload = json.loads(schema_path.read_text(encoding="utf-8"))
        if not isinstance(schema_payload.get("x-setta-ui-settings"), list):
            raise ValueError(
                "Fixture plugin schema is missing x-setta-ui-settings list."
            )
        first_entry = schema_payload["x-setta-ui-settings"][0]
        if not isinstance(first_entry, dict):
            raise ValueError("Fixture plugin schema has non-object setting definition.")
        first_entry["defaultValue"] = "not-a-boolean-default"
        schema_path.write_text(
            json.dumps(schema_payload, indent=2) + "\n",
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

        core_results = search_ui_settings(
            query="watch code enabled",
            sourceFilter="core",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert any(
            entry.settingId == "core.watch_code.enabled"
            for entry in core_results.results
        )

        plugin_results = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert plugin_results.results == []

        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert "defaultValue is invalid" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_ui_setting_flow_from_backend_registered_handlers(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        (plugin_root / "backend" / "entrypoint.py").write_text(
            "_STATE = {'enabled': False}\n\n"
            "def _read_backend_enabled(*, project_config_id: str):\n"
            "    return _STATE['enabled']\n\n"
            "def _write_backend_enabled(*, project_config_id: str, value):\n"
            "    _STATE['enabled'] = bool(value)\n"
            "    return {'ok': True, 'projectConfigId': project_config_id}\n\n"
            "def register(plugin):\n"
            "    plugin.register_ui_setting(\n"
            "        {\n"
            "            'id': 'backend_enabled',\n"
            "            'title': 'Backend Enabled',\n"
            "            'description': 'Enable backend-provided fixture behavior.',\n"
            "            'paneId': 'full-settings-pane',\n"
            "            'revealKey': 'full-settings',\n"
            "            'synonyms': ['backend enabled'],\n"
            "            'mutability': 'writable',\n"
            "            'valueSchema': {'type': 'boolean'},\n"
            "            'read': _read_backend_enabled,\n"
            "            'write': _write_backend_enabled,\n"
            "        }\n"
            "    )\n",
            encoding="utf-8",
        )

        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        plugin_manager.load_backend_plugins(app=FastAPI())

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
        plugin_setting_id = f"plugin::{plugin_id}::backend_enabled"

        try:
            search_result = search_ui_settings(
                query="backend enabled",
                sourceFilter="plugin",
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            result_ids = [entry.settingId for entry in search_result.results]
            assert plugin_setting_id in result_ids

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

            updated_get_result = await get_ui_setting_value(
                settingId=plugin_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert updated_get_result.error is None
            assert updated_get_result.value is True

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
            assert (
                target.overviewTabKey
                == "PluginPane:setta-fixture-full:full-settings-pane"
            )
            assert frontend_sender.reveal_messages
        finally:
            plugin_manager.shutdown_backend_plugins()


@pytest.mark.asyncio
async def test_plugin_backend_ui_setting_read_type_mismatch_returns_structured_error(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        (plugin_root / "backend" / "entrypoint.py").write_text(
            "def _read_backend_enabled(*, project_config_id: str):\n"
            "    return 'invalid-string'\n\n"
            "def _write_backend_enabled(*, project_config_id: str, value):\n"
            "    return {'ok': True, 'projectConfigId': project_config_id, 'value': value}\n\n"
            "def register(plugin):\n"
            "    plugin.register_ui_setting(\n"
            "        {\n"
            "            'id': 'backend_enabled',\n"
            "            'title': 'Backend Enabled',\n"
            "            'description': 'Enable backend-provided fixture behavior.',\n"
            "            'paneId': 'full-settings-pane',\n"
            "            'revealKey': 'full-settings',\n"
            "            'synonyms': ['backend enabled'],\n"
            "            'mutability': 'writable',\n"
            "            'valueSchema': {'type': 'boolean'},\n"
            "            'read': _read_backend_enabled,\n"
            "            'write': _write_backend_enabled,\n"
            "        }\n"
            "    )\n",
            encoding="utf-8",
        )

        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        plugin_manager.load_backend_plugins(app=FastAPI())

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
        plugin_setting_id = f"plugin::{plugin_id}::backend_enabled"

        try:
            get_result = await get_ui_setting_value(
                settingId=plugin_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert get_result.error is not None
            assert get_result.error.code == "invalid_value_type"
            assert "returned an invalid value" in get_result.error.message
        finally:
            plugin_manager.shutdown_backend_plugins()


@pytest.mark.asyncio
async def test_plugin_ui_setting_returns_plugin_unavailable_when_disabled(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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


@pytest.mark.asyncio
async def test_search_ui_settings_source_filter_separates_core_and_plugin_entries(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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

        core_results = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="core",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        core_result_ids = [entry.settingId for entry in core_results.results]
        assert plugin_setting_id not in core_result_ids

        plugin_results = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        plugin_result_ids = [entry.settingId for entry in plugin_results.results]
        assert plugin_setting_id in plugin_result_ids


@pytest.mark.asyncio
async def test_search_ui_settings_ignores_disabled_plugins(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
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

        plugin_results = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert plugin_results.results == []


@pytest.mark.asyncio
async def test_search_ui_settings_skips_plugins_with_duplicate_setting_ids(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        schema_path = plugin_root / "content" / "config" / "schema.json"
        schema_payload = json.loads(schema_path.read_text(encoding="utf-8"))
        if not isinstance(schema_payload.get("x-setta-ui-settings"), list):
            raise ValueError(
                "Fixture plugin schema is missing x-setta-ui-settings list."
            )
        first_entry = dict(schema_payload["x-setta-ui-settings"][0])
        schema_payload["x-setta-ui-settings"].append(first_entry)
        schema_path.write_text(
            json.dumps(schema_payload, indent=2) + "\n",
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

        core_results = search_ui_settings(
            query="watch code enabled",
            sourceFilter="core",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert any(
            entry.settingId == "core.watch_code.enabled"
            for entry in core_results.results
        )

        plugin_results = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert plugin_results.results == []

        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert "duplicated ui settingId" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_ui_setting_cross_source_duplicates_are_isolated(
    tmp_path: Path,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        plugin_manager = _build_plugin_manager(tmp_path)
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        (plugin_root / "backend" / "entrypoint.py").write_text(
            "_STATE = {'enabled': False}\n\n"
            "def _read_backend_enabled(*, project_config_id: str):\n"
            "    return _STATE['enabled']\n\n"
            "def _write_backend_enabled(*, project_config_id: str, value):\n"
            "    _STATE['enabled'] = bool(value)\n"
            "    return {'ok': True, 'projectConfigId': project_config_id}\n\n"
            "def register(plugin):\n"
            "    plugin.register_ui_setting(\n"
            "        {\n"
            "            'id': 'enabled',\n"
            "            'title': 'Backend Enabled Duplicate',\n"
            "            'description': 'Conflicts with schema-enabled.',\n"
            "            'paneId': 'full-settings-pane',\n"
            "            'revealKey': 'full-settings',\n"
            "            'synonyms': ['backend enabled duplicate'],\n"
            "            'mutability': 'writable',\n"
            "            'valueSchema': {'type': 'boolean'},\n"
            "            'read': _read_backend_enabled,\n"
            "            'write': _write_backend_enabled,\n"
            "        }\n"
            "    )\n",
            encoding="utf-8",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        plugin_manager.load_backend_plugins(app=FastAPI())

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
        conflicting_setting_id = f"plugin::{plugin_id}::enabled"
        healthy_setting_id = f"plugin::{plugin_id}::label"

        try:
            # Conflicting plugin settings should not break core discovery paths.
            core_results = search_ui_settings(
                query="watch code enabled",
                sourceFilter="core",
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert any(
                entry.settingId == "core.watch_code.enabled"
                for entry in core_results.results
            )

            # Healthy settings from the same plugin should still be available.
            healthy_get_result = await get_ui_setting_value(
                settingId=healthy_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert healthy_get_result.error is None
            assert isinstance(healthy_get_result.value, str)

            # The conflicting setting should be isolated with plugin_unavailable errors.
            get_result = await get_ui_setting_value(
                settingId=conflicting_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert get_result.error is not None
            assert get_result.error.code == "plugin_unavailable"
            assert (
                "declared in both schema and backend registration"
                in get_result.error.message
            )

            set_result = await set_ui_setting_value(
                settingId=conflicting_setting_id,
                value=True,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert set_result.error is not None
            assert set_result.error.code == "plugin_unavailable"

            reveal_result = await reveal_ui_setting(
                settingId=conflicting_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert reveal_result.emittedRevealCount == 0
            assert len(reveal_result.statuses) == 1
            assert reveal_result.statuses[0].status == "failed"
            assert reveal_result.statuses[0].error is not None
            assert reveal_result.statuses[0].error.code == "plugin_unavailable"
        finally:
            plugin_manager.shutdown_backend_plugins()
