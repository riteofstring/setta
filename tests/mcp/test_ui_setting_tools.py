import asyncio
import json
import shutil
from pathlib import Path
from time import monotonic
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext
from pydantic import BaseModel

import setta.mcp.tools.ui_settings as ui_settings_tools_module
from setta.agentic.agentic_scope import AgenticContext
from setta.app.spec_store import default_app_spec_path
from setta.mcp.errors import InvalidToolArgumentsError
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
    SetWatchCodeEnabledRequest,
)
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.plugins.manager import PluginManager
from setta.plugins.models import PluginRuntimeState, PluginScope
from setta.types.app_definition import AppDefinition
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
)
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
        self.connected_frontend_affinity_tokens: list[str] = ["frontend-test"]
        self.undeliverable_target_websocket_ids: set[str] = set()
        self.disconnect_after_dispatch_websocket_ids: set[str] = set()
        self.resolved_target_websocket_ids: list[str] = []
        self.frontend_affinity_token_by_affinity_token: dict[str, str] = {}
        self.skip_reveal_result_resolution = False
        self.override_reveal_statuses: list[UISettingRevealResultStatus] | None = None
        self.override_reveal_project_config_id: ID | None = None
        self.override_reveal_from_websocket_id: str | None = None

    def resolve_frontend_websocket_id_from_affinity_token(
        self,
        *,
        affinity_token: str,
        share_session_id: str | None = None,  # noqa: ARG002 - signature parity
    ) -> str | None:
        if affinity_token in self.frontend_affinity_token_by_affinity_token:
            return self.frontend_affinity_token_by_affinity_token[affinity_token]
        if affinity_token in self.connected_frontend_affinity_tokens:
            return affinity_token
        return None

    def select_frontend_websocket_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002 - signature parity
        preferred_websocket_id: str | None = None,
    ) -> str | None:
        if preferred_websocket_id is not None:
            if preferred_websocket_id in self.connected_frontend_affinity_tokens:
                return preferred_websocket_id
            return None
        if self.reveal_target_websocket_id is not None:
            return self.reveal_target_websocket_id
        if not self.connected_frontend_affinity_tokens:
            return None
        return sorted(self.connected_frontend_affinity_tokens)[0]

    def list_frontend_websocket_ids_for_ui_setting_reveal(
        self,
        *,
        share_session_id: str | None = None,  # noqa: ARG002 - signature parity
    ) -> list[str]:
        return sorted(self.connected_frontend_affinity_tokens)

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
        if resolved_target_websocket_id in self.undeliverable_target_websocket_ids:
            return None
        self.resolved_target_websocket_ids.append(resolved_target_websocket_id)
        self.reveal_messages.append((content, share_session_id))
        if (
            resolved_target_websocket_id
            in self.disconnect_after_dispatch_websocket_ids
        ):
            self.reveal_result_hub.cancel_requests_for_websocket_id(
                resolved_target_websocket_id
            )
            return resolved_target_websocket_id
        if self.skip_reveal_result_resolution:
            return resolved_target_websocket_id
        statuses: list[UISettingRevealResultStatus] = []
        if self.override_reveal_statuses is not None:
            statuses = list(self.override_reveal_statuses)
        else:
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
                projectConfigId=(
                    self.override_reveal_project_config_id
                    if self.override_reveal_project_config_id is not None
                    else content.projectConfigId
                ),
                requestId=content.requestId,
                statuses=statuses,
            ),
            from_websocket_id=(
                self.override_reveal_from_websocket_id
                if self.override_reveal_from_websocket_id is not None
                else resolved_target_websocket_id
            ),
        )
        return resolved_target_websocket_id


class _RequestMetaModel(BaseModel):
    projectConfigId: ID
    sectionId: ID | None = None
    frontendAffinityToken: str | None = None


def _build_ctx(
    *,
    main_manager,
    settings_manager,
    frontend_sender: _RecordingFrontendSender,
    project_manager_switcher=None,
    plugin_manager: PluginManager | None = None,
    dbe=None,
    agent_runner=None,
    request_meta: BaseModel | dict[str, object] | None = None,
    agentic_context: AgenticContext | None = None,
    resolved_share_session_id: str | None = None,
    deployment_mode: bool = False,
) -> Context:
    reveal_result_hub = UISettingRevealResultHub()
    frontend_sender.reveal_result_hub = reveal_result_hub
    switcher = project_manager_switcher
    if switcher is None:
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
        deployment_mode=deployment_mode,
    )
    fastmcp = SimpleNamespace(state=state)
    if agentic_context is not None:
        fastmcp._resolve_agentic_context = lambda _ctx: agentic_context
    if resolved_share_session_id is not None:
        fastmcp._resolve_share_session_id = lambda _ctx: resolved_share_session_id
    if request_meta is None:
        return Context(fastmcp=fastmcp)
    request_context = RequestContext(
        request_id="test-request-id",
        meta=request_meta,
        session=object(),
        lifespan_context=object(),
        request=None,
    )
    return Context(
        fastmcp=fastmcp,
        request_context=request_context,
    )


class _ShareSessionStrictProjectManagerSwitcher:
    def __init__(
        self,
        delegate: ProjectManagerSwitcher,
        *,
        required_share_session_id: str,
    ) -> None:
        self._delegate = delegate
        self._required_share_session_id = required_share_session_id
        self.calls: list[tuple[str | object, str | None]] = []
        self.main = delegate.main

    def get(
        self,
        project_identifier,
        *,
        share_session_id: str | None = None,
    ):
        self.calls.append((project_identifier, share_session_id))
        if share_session_id != self._required_share_session_id:
            raise KeyError("Missing share session id")
        return self._delegate.get(project_identifier)


class _ShareScopedDefaultProjectManagerSwitcher:
    def __init__(
        self,
        *,
        main_manager,
        share_manager,
        required_share_session_id: str,
    ) -> None:
        self.main = main_manager
        self._share_manager = share_manager
        self._required_share_session_id = required_share_session_id
        self.calls: list[tuple[str | object, str | None]] = []
        self.get_for_session_calls: list[str] = []

    def get_for_session(self, share_session_id: str):
        self.get_for_session_calls.append(share_session_id)
        if share_session_id != self._required_share_session_id:
            raise KeyError("Missing share session id")
        return self._share_manager

    def get(
        self,
        project_identifier,
        *,
        share_session_id: str | None = None,
    ):
        self.calls.append((project_identifier, share_session_id))
        if share_session_id != self._required_share_session_id:
            raise KeyError("Missing share session id")
        if project_identifier == ID("__share_session_default_project__"):
            return self._share_manager
        expected_project_id = (
            self._share_manager.project_state_backend.defaultProjectConfigId
        )
        if project_identifier != expected_project_id:
            raise KeyError(f"Unexpected project identifier: {project_identifier}")
        return self._share_manager


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
async def test_search_ui_settings_rejects_blank_query() -> None:
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

        # Blank search input should be reported as caller-invalid arguments.
        with pytest.raises(InvalidToolArgumentsError, match="query must not be empty"):
            search_ui_settings(
                query="   ",
                projectConfigId=project_config_id,
                ctx=ctx,
            )


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
async def test_set_ui_setting_value_watch_code_folders_invalid_item_shape_is_typed_and_side_effect_free() -> (
    None
):
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
            settingId="core.watch_code.folders",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert initial_result.error is None
        assert isinstance(initial_result.value, list)

        invalid_result = await set_ui_setting_value(
            settingId="core.watch_code.folders",
            value=[
                {
                    "path": "./backend",
                    "recursive": "not-a-boolean",
                }
            ],
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert invalid_result.error is not None
        assert invalid_result.error.code == "invalid_value_type"
        assert invalid_result.error.code != "mutation_failed"

        unchanged_result = await get_ui_setting_value(
            settingId="core.watch_code.folders",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unchanged_result.error is None
        assert unchanged_result.value == initial_result.value


@pytest.mark.asyncio
async def test_set_ui_setting_value_watch_code_folders_rejects_unknown_properties() -> (
    None
):
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
            settingId="core.watch_code.folders",
            value=[
                {
                    "path": "./backend",
                    "recursive": True,
                    "extra": "not-allowed",
                }
            ],
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "invalid_value_type"
        assert "unsupported properties" in result.error.message


@pytest.mark.asyncio
async def test_set_ui_setting_value_rejects_writer_old_value_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    read_calls = 0
    observed_expected_old_value: object | None = None
    state = {"current": True, "write_count": 0}

    async def _read_value(_ctx: Context, _project_config_id: ID) -> bool:
        nonlocal read_calls
        read_calls += 1
        if read_calls == 1:
            # Simulate a stale pre-write snapshot.
            return False
        return bool(state["current"])

    async def _write_value(
        _ctx: Context,
        _project_config_id: ID,
        _value: bool,
        expected_old_value: object | None = None,
    ) -> UISettingMutationResult:
        nonlocal observed_expected_old_value
        observed_expected_old_value = expected_old_value
        if expected_old_value != state["current"]:
            raise ui_settings_tools_module.UISettingValidationError(
                "mutation_failed",
                "UI setting core.test.flag changed since pre-write validation. Retry with a fresh read before writing.",
            )
        state["write_count"] += 1
        state["current"] = _value
        return UISettingMutationResult(
            oldValue=not _value,
            newValue=_value,
            normalizedValue=_value,
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

    def _build_fake_registry(
        *,
        ctx: Context,
        project_config_id: ID,
    ) -> _FakeRegistry:
        assert ctx is not None
        assert isinstance(project_config_id, str)
        return _FakeRegistry()

    monkeypatch.setattr(
        ui_settings_tools_module,
        "build_ui_settings_registry",
        _build_fake_registry,
    )

    # Writer responses must match the validated pre-write snapshot.
    result = await set_ui_setting_value(
        settingId="core.test.flag",
        value=True,
        projectConfigId=ID("project-1"),
        ctx=Context(
            fastmcp=SimpleNamespace(
                state=SimpleNamespace(
                    project_manager_switcher=SimpleNamespace(main=None)
                )
            )
        ),
    )

    assert result.error is not None
    assert result.error.code == "mutation_failed"
    assert "changed since pre-write validation" in (result.error.message)
    assert observed_expected_old_value is False
    assert state["write_count"] == 0
    assert state["current"] is True
    assert result.newValue is None
    assert result.changed is False


@pytest.mark.asyncio
async def test_set_ui_setting_value_rejects_writer_missing_expected_old_value_before_invocation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state = {"current": False}
    write_invocation_count = 0

    async def _read_value(_ctx: Context, _project_config_id: ID) -> bool:
        return bool(state["current"])

    async def _write_value_without_precondition(
        _ctx: Context,
        _project_config_id: ID,
        _value: bool,
    ) -> UISettingMutationResult:
        nonlocal write_invocation_count
        write_invocation_count += 1
        old_value = bool(state["current"])
        state["current"] = _value
        return UISettingMutationResult(
            oldValue=old_value,
            newValue=_value,
            normalizedValue=_value,
            changed=old_value != _value,
        )

    runtime_entry = UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId="core.test.flag_without_precondition",
            title="Test Flag Without Precondition",
            description="Validates strict expected_old_value contract.",
            source="core",
            mutability="writable",
            location=UISettingLocation(side="left", overviewTabKey="Overview"),
            highlight=UISettingHighlight(
                strategy="dom_anchor",
                anchorId="core.test.flag_without_precondition",
            ),
            valueSchema=UISettingValueSchema(type="boolean"),
        ),
        readValue=_read_value,
        writeValue=_write_value_without_precondition,
    )

    class _FakeRegistry:
        def __init__(self) -> None:
            self.pluginErrorsByPluginId: dict[str, str] = {}

        def get(self, setting_id: str) -> UISettingRuntimeEntry | None:
            if setting_id == "core.test.flag_without_precondition":
                return runtime_entry
            return None

    def _build_fake_registry(
        *,
        ctx: Context,
        project_config_id: ID,
    ) -> _FakeRegistry:
        assert ctx is not None
        assert isinstance(project_config_id, str)
        return _FakeRegistry()

    monkeypatch.setattr(
        ui_settings_tools_module,
        "build_ui_settings_registry",
        _build_fake_registry,
    )

    result = await set_ui_setting_value(
        settingId="core.test.flag_without_precondition",
        value=True,
        projectConfigId=ID("project-1"),
        ctx=Context(
            fastmcp=SimpleNamespace(
                state=SimpleNamespace(
                    project_manager_switcher=SimpleNamespace(main=None)
                )
            )
        ),
    )
    assert result.error is not None
    assert result.error.code == "mutation_failed"
    assert "writeValue must accept expected_old_value" in result.error.message
    assert write_invocation_count == 0
    assert state["current"] is False


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
async def test_reveal_right_pane_does_not_use_backend_active_ids_reveal_helpers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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

        async def _fail_set_active_ids_for_ui_setting_reveal(
            *,
            project_config_id: ID,  # noqa: ARG001
            active_ids: list[ID],  # noqa: ARG001
        ) -> str:
            raise AssertionError(
                "set_active_ids_for_ui_setting_reveal should not be called"
            )

        async def _fail_rollback_active_ids_for_ui_setting_reveal(
            *,
            project_config_id: ID,  # noqa: ARG001
            reveal_activation_lease_id: str,  # noqa: ARG001
            rollback_active_ids: list[ID],  # noqa: ARG001
        ) -> bool:
            raise AssertionError(
                "rollback_active_ids_for_ui_setting_reveal should not be called"
            )

        monkeypatch.setattr(
            manager,
            "set_active_ids_for_ui_setting_reveal",
            _fail_set_active_ids_for_ui_setting_reveal,
        )
        monkeypatch.setattr(
            manager,
            "rollback_active_ids_for_ui_setting_reveal",
            _fail_rollback_active_ids_for_ui_setting_reveal,
        )
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.activeSectionId == section_id


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
async def test_set_ui_setting_value_python_codegen_enabled_same_value_is_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        project_state = manager.get_single_config_state(project_config_id)
        project_state.projectConfig.codegenTargets = [
            ProjectCodegenPythonTarget(genCodePrefix="# keep python target first"),
            ProjectCodegenPluginTarget(language="plugin.codegen.target"),
        ]

        update_calls = 0
        history_len_before = len(manager.history._history)
        original_update = manager.update_and_broadcast_project_state

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        monkeypatch.setattr(
            manager, "update_and_broadcast_project_state", _record_update
        )

        # Writing the already-enabled value must not reorder targets or trigger persistence work.
        set_result = await set_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert set_result.error is None
        assert set_result.changed is False
        assert set_result.newValue is True
        assert len(manager.history._history) == history_len_before
        assert update_calls == 0
        updated_targets = manager.get_single_config_state(
            project_config_id
        ).projectConfig.codegenTargets
        assert isinstance(updated_targets[0], ProjectCodegenPythonTarget)
        assert isinstance(updated_targets[1], ProjectCodegenPluginTarget)
        assert [target.language for target in updated_targets] == [
            ProjectCodegenLanguage.python,
            "plugin.codegen.target",
        ]


@pytest.mark.asyncio
async def test_set_ui_setting_value_show_param_display_names_same_value_is_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current = await get_ui_setting_value(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current.error is None
        assert isinstance(current.value, bool)
        update_calls = 0
        original_update = manager._update_and_broadcast_project_state_no_name_validation

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        monkeypatch.setattr(
            manager,
            "_update_and_broadcast_project_state_no_name_validation",
            _record_update,
        )

        # No-op writes must not emit right-pane update broadcasts.
        result = await set_ui_setting_value(
            settingId="core.project.show_param_display_names",
            value=current.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert result.error is None
        assert result.changed is False
        assert result.newValue == current.value
        assert update_calls == 0


@pytest.mark.asyncio
async def test_set_ui_setting_value_watch_code_noops_do_not_broadcast_or_rebaseline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        update_calls = 0
        baseline_enable_calls = 0
        baseline_inputs_calls = 0
        original_update = manager.update_and_broadcast_project_state
        original_baseline_on_enable = manager.watch_code_manager.baseline_on_enable
        original_baseline_for_new_inputs = (
            manager.watch_code_manager.baseline_for_new_inputs
        )

        async def _record_update(*args, **kwargs) -> None:
            nonlocal update_calls
            update_calls += 1
            await original_update(*args, **kwargs)

        def _record_baseline_on_enable(*args, **kwargs) -> None:
            nonlocal baseline_enable_calls
            baseline_enable_calls += 1
            original_baseline_on_enable(*args, **kwargs)

        def _record_baseline_for_new_inputs(*args, **kwargs) -> None:
            nonlocal baseline_inputs_calls
            baseline_inputs_calls += 1
            original_baseline_for_new_inputs(*args, **kwargs)

        monkeypatch.setattr(
            manager, "update_and_broadcast_project_state", _record_update
        )
        monkeypatch.setattr(
            manager.watch_code_manager,
            "baseline_on_enable",
            _record_baseline_on_enable,
        )
        monkeypatch.setattr(
            manager.watch_code_manager,
            "baseline_for_new_inputs",
            _record_baseline_for_new_inputs,
        )

        enabled_value = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        folders_value = await get_ui_setting_value(
            settingId="core.watch_code.folders",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        files_value = await get_ui_setting_value(
            settingId="core.watch_code.files",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert enabled_value.error is None
        assert folders_value.error is None
        assert files_value.error is None

        # Re-writing identical watch-code settings must be side-effect free.
        enabled_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=enabled_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        folders_result = await set_ui_setting_value(
            settingId="core.watch_code.folders",
            value=folders_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        files_result = await set_ui_setting_value(
            settingId="core.watch_code.files",
            value=files_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert enabled_result.error is None
        assert folders_result.error is None
        assert files_result.error is None
        assert enabled_result.changed is False
        assert folders_result.changed is False
        assert files_result.changed is False
        assert update_calls == 0
        assert baseline_enable_calls == 0
        assert baseline_inputs_calls == 0


@pytest.mark.asyncio
async def test_set_ui_setting_value_project_name_same_value_is_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current = await get_ui_setting_value(
            settingId="core.project.name",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current.error is None
        assert isinstance(current.value, str)
        metadata_broadcast_calls = 0
        manual_save_calls = 0
        original_broadcast = manager.broadcast_all_project_metadata
        original_manual_save = manager.perform_manual_save

        async def _record_broadcast() -> None:
            nonlocal metadata_broadcast_calls
            metadata_broadcast_calls += 1
            await original_broadcast()

        def _record_manual_save() -> None:
            nonlocal manual_save_calls
            manual_save_calls += 1
            original_manual_save()

        monkeypatch.setattr(
            manager, "broadcast_all_project_metadata", _record_broadcast
        )
        monkeypatch.setattr(manager, "perform_manual_save", _record_manual_save)

        # No-op project rename should not broadcast metadata or trigger manual save.
        result = await set_ui_setting_value(
            settingId="core.project.name",
            value=current.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert result.error is None
        assert result.changed is False
        assert result.newValue == current.value
        assert metadata_broadcast_calls == 0
        assert manual_save_calls == 0


@pytest.mark.asyncio
async def test_set_ui_setting_value_app_metadata_noops_do_not_materialize_app_definition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        assert manager.project_state_backend.appDefinition is None
        default_spec_path = default_app_spec_path()
        assert not (manager.dbe.path / default_spec_path).exists()
        commit_calls = 0
        original_commit = manager._commit_app_definition_metadata_update

        async def _record_commit(*args, **kwargs) -> None:
            nonlocal commit_calls
            commit_calls += 1
            await original_commit(*args, **kwargs)

        monkeypatch.setattr(
            manager,
            "_commit_app_definition_metadata_update",
            _record_commit,
        )

        catalog_value = await get_ui_setting_value(
            settingId="core.app.catalog_id",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        spec_version_value = await get_ui_setting_value(
            settingId="core.app.spec_version",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        spec_path_value = await get_ui_setting_value(
            settingId="core.app.spec_path",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        theme_mode_value = await get_ui_setting_value(
            settingId="core.app.theme_mode",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert catalog_value.error is None
        assert spec_version_value.error is None
        assert spec_path_value.error is None
        assert theme_mode_value.error is None

        # Same-value app metadata writes must not create appDefinition or app spec files.
        catalog_result = await set_ui_setting_value(
            settingId="core.app.catalog_id",
            value=catalog_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        spec_version_result = await set_ui_setting_value(
            settingId="core.app.spec_version",
            value=spec_version_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        spec_path_result = await set_ui_setting_value(
            settingId="core.app.spec_path",
            value=spec_path_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        theme_mode_result = await set_ui_setting_value(
            settingId="core.app.theme_mode",
            value=theme_mode_value.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )

        assert catalog_result.error is None
        assert spec_version_result.error is None
        assert spec_path_result.error is None
        assert theme_mode_result.error is None
        assert catalog_result.changed is False
        assert spec_version_result.changed is False
        assert spec_path_result.changed is False
        assert theme_mode_result.changed is False
        assert commit_calls == 0
        assert manager.project_state_backend.appDefinition is None
        assert not (manager.dbe.path / default_spec_path).exists()


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
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert (
            reveal_content.reveals[0].settingId
            == "core.project.show_param_display_names"
        )
        assert reveal_content.activeSectionId == section_id


@pytest.mark.asyncio
async def test_reveal_right_pane_prefers_explicit_section_over_agentic_and_request_meta() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)

        explicit_section_result = await manager.create_top_level_section(
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
        explicit_section_id = explicit_section_result.sectionId
        non_explicit_section_result = await manager.create_top_level_section(
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
        non_explicit_section_id = non_explicit_section_result.sectionId
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
            request_meta={
                "projectConfigId": project_config_id,
                "sectionId": non_explicit_section_id,
            },
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-agentic"),
                section_id=non_explicit_section_id,
                frontend_affinity_token=None,
                allow_unscoped=True,
            ),
        )

        # Explicit sectionIdToActivate must win over agentic + request-meta section context.
        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=explicit_section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.activeSectionId == explicit_section_id


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
async def test_reveal_right_pane_no_frontend_does_not_mutate_active_section() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = []
        frontend_sender.reveal_target_websocket_id = None
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert result.statuses[0].error.code == "mutation_failed"
        assert "No connected frontend" in result.statuses[0].error.message
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
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert (
            reveal_content.reveals[0].settingId
            == "core.project.show_param_display_names"
        )
        assert reveal_content.activeSectionId == section_id


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
async def test_set_ui_setting_value_reveal_after_set_no_frontend_does_not_activate_section() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = []
        frontend_sender.reveal_target_websocket_id = None
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta=_RequestMetaModel(
                projectConfigId=project_config_id,
                sectionId=section_id,
            ),
        )
        current_value_result = await get_ui_setting_value(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)
        set_result = await set_ui_setting_value(
            settingId="core.project.show_param_display_names",
            value=not current_value_result.value,
            revealAfterSet=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.reveal is not None
        assert set_result.reveal.emittedRevealCount == 0
        assert set_result.reveal.statuses[0].status == "failed"
        assert set_result.reveal.statuses[0].error is not None
        assert "No connected frontend" in set_result.reveal.statuses[0].error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []


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
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.activeSectionId == section_id


@pytest.mark.asyncio
async def test_reveal_right_pane_uses_agentic_context_project_and_section() -> None:
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
            agentic_context=AgenticContext(
                project_config_id=target_project_config_id,
                chat_id=ID("chat-agentic"),
                section_id=section_id,
                frontend_affinity_token=None,
                allow_unscoped=True,
            ),
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"

        updated_state = manager.get_single_config_state(target_project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages
        reveal_content, _ = frontend_sender.reveal_messages[0]
        assert reveal_content.activeSectionId == section_id


@pytest.mark.asyncio
@pytest.mark.parametrize("tool_name", ["search", "get", "set", "reveal"])
async def test_ui_setting_tools_reject_project_argument_mismatching_agentic_context(
    tool_name: str,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        project_config_id_a = ID(manager.project_state_backend.defaultProjectConfigId)
        existing_project_config_ids = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        await manager.create_project_config("bg-orange-500/60 dark:bg-orange-600/30")
        project_config_ids_after_create = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        new_project_config_ids = (
            project_config_ids_after_create - existing_project_config_ids
        )
        assert len(new_project_config_ids) == 1
        project_config_id_b = ID(next(iter(new_project_config_ids)))

        value_a_before = manager.get_single_config_state(
            project_config_id_a
        ).projectConfig.watchCodeEnabled
        value_b_before = manager.get_single_config_state(
            project_config_id_b
        ).projectConfig.watchCodeEnabled
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            agentic_context=AgenticContext(
                project_config_id=project_config_id_a,
                chat_id=ID("chat-agentic"),
                section_id=None,
                frontend_affinity_token=None,
                allow_unscoped=True,
            ),
        )

        with pytest.raises(
            ValueError,
            match=(
                "projectConfigId argument .* does not match agentic context "
                "projectConfigId"
            ),
        ):
            if tool_name == "search":
                search_ui_settings(
                    query="watch code",
                    projectConfigId=project_config_id_b,
                    ctx=ctx,
                )
            elif tool_name == "get":
                await get_ui_setting_value(
                    settingId="core.watch_code.enabled",
                    projectConfigId=project_config_id_b,
                    ctx=ctx,
                )
            elif tool_name == "set":
                await set_ui_setting_value(
                    settingId="core.watch_code.enabled",
                    value=True,
                    projectConfigId=project_config_id_b,
                    ctx=ctx,
                )
            elif tool_name == "reveal":
                await reveal_ui_setting(
                    settingId="core.watch_code.enabled",
                    projectConfigId=project_config_id_b,
                    ctx=ctx,
                )
            else:
                raise ValueError(f"Unsupported tool in parameterized test: {tool_name}")

        value_a_after = manager.get_single_config_state(
            project_config_id_a
        ).projectConfig.watchCodeEnabled
        value_b_after = manager.get_single_config_state(
            project_config_id_b
        ).projectConfig.watchCodeEnabled
        assert value_a_after == value_a_before
        assert value_b_after == value_b_before


@pytest.mark.asyncio
async def test_ui_setting_tools_reject_project_argument_mismatch_in_share_mode() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        project_config_id_a = ID(manager.project_state_backend.defaultProjectConfigId)
        existing_project_config_ids = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        await manager.create_project_config("bg-pink-500/60 dark:bg-pink-600/30")
        project_config_ids_after_create = set(
            manager.project_state_backend.projectConfigs.keys()
        )
        new_project_config_ids = (
            project_config_ids_after_create - existing_project_config_ids
        )
        assert len(new_project_config_ids) == 1
        project_config_id_b = ID(next(iter(new_project_config_ids)))
        share_session_id = "share-session-mismatch"
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id=share_session_id,
        )
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            agentic_context=AgenticContext(
                project_config_id=project_config_id_a,
                chat_id=ID("chat-agentic"),
                section_id=None,
                frontend_affinity_token=None,
                allow_unscoped=True,
            ),
            resolved_share_session_id=share_session_id,
        )

        with pytest.raises(
            ValueError,
            match=(
                "projectConfigId argument .* does not match agentic context "
                "projectConfigId"
            ),
        ):
            await get_ui_setting_value(
                settingId="core.watch_code.enabled",
                projectConfigId=project_config_id_b,
                ctx=ctx,
            )

        assert strict_switcher.calls == []


@pytest.mark.asyncio
async def test_ui_setting_tools_pass_share_session_id_to_project_manager_lookup() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-share"]
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        required_share_session_id = "share-session-test"
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id=required_share_session_id,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": required_share_session_id,
            },
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-share-session-propagation"),
                section_id=None,
                frontend_affinity_token="frontend-share",
                allow_unscoped=True,
            ),
            deployment_mode=True,
        )

        read_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert read_result.error is None
        assert isinstance(read_result.value, bool)

        set_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=not read_result.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None

        reveal_result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert reveal_result.statuses[0].status == "revealed"

        assert strict_switcher.calls
        for _, share_session_id in strict_switcher.calls:
            assert share_session_id == required_share_session_id


@pytest.mark.asyncio
async def test_ui_setting_tools_prefer_resolved_share_session_id_over_request_meta() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-share"]
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        resolved_share_session_id = "share-session-resolved"
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id=resolved_share_session_id,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": "share-session-meta",
            },
            resolved_share_session_id=resolved_share_session_id,
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-resolved-share-session"),
                section_id=None,
                frontend_affinity_token="frontend-share",
                allow_unscoped=True,
            ),
        )

        # Resolver-derived share-session scope must override request-meta shareSessionId.
        read_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert read_result.error is None
        assert isinstance(read_result.value, bool)

        set_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=not read_result.value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.newValue == (not read_result.value)

        reveal_result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert reveal_result.statuses[0].status == "revealed"
        assert strict_switcher.calls
        for _, share_session_id in strict_switcher.calls:
            assert share_session_id == resolved_share_session_id
        assert frontend_sender.reveal_messages
        _, reveal_share_session_id = frontend_sender.reveal_messages[0]
        assert reveal_share_session_id == resolved_share_session_id


@pytest.mark.asyncio
async def test_ui_setting_tools_share_scope_without_project_id_uses_share_default() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        main_manager = project_fixture.manager
        share_manager = settings_fixture.manager
        share_default_project_id = ID(
            share_manager.project_state_backend.defaultProjectConfigId
        )
        main_default_project_id = ID(
            main_manager.project_state_backend.defaultProjectConfigId
        )
        if share_default_project_id == main_default_project_id:
            existing_project_config_ids = set(
                share_manager.project_state_backend.projectConfigs.keys()
            )
            await share_manager.create_project_config("share-default-project")
            updated_project_config_ids = set(
                share_manager.project_state_backend.projectConfigs.keys()
            )
            new_project_config_ids = (
                updated_project_config_ids - existing_project_config_ids
            )
            if len(new_project_config_ids) != 1:
                raise AssertionError("Expected one new share project config id.")
            share_default_project_id = ID(next(iter(new_project_config_ids)))
            await share_manager.set_as_default_project(share_default_project_id)

        required_share_session_id = "share-session-default-project"
        switcher = _ShareScopedDefaultProjectManagerSwitcher(
            main_manager=main_manager,
            share_manager=share_manager,
            required_share_session_id=required_share_session_id,
        )
        ctx = _build_ctx(
            main_manager=main_manager,
            settings_manager=share_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=switcher,
            request_meta={"shareSessionId": required_share_session_id},
            resolved_share_session_id=required_share_session_id,
        )

        result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            ctx=ctx,
        )
        assert result.error is None
        assert isinstance(result.value, bool)
        assert switcher.get_for_session_calls == []
        assert switcher.calls
        assert switcher.calls[0] == (
            ID("__share_session_default_project__"),
            required_share_session_id,
        )
        assert switcher.calls[1] == (
            share_default_project_id,
            required_share_session_id,
        )


@pytest.mark.asyncio
async def test_reveal_ui_setting_share_scope_ignores_caller_supplied_frontend_affinity_token() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        required_share_session_id = "share-session-test"
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id=required_share_session_id,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": required_share_session_id,
                "frontendAffinityToken": "frontend-b",
            },
            resolved_share_session_id=required_share_session_id,
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-share-origin"),
                section_id=None,
                frontend_affinity_token="frontend-a",
                allow_unscoped=True,
            ),
        )

        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        assert frontend_sender.resolved_target_websocket_ids[-1] == "frontend-a"
        assert frontend_sender.reveal_messages
        _, reveal_share_session_id = frontend_sender.reveal_messages[-1]
        assert reveal_share_session_id == required_share_session_id


@pytest.mark.asyncio
async def test_set_ui_setting_value_reveal_after_set_share_scope_ignores_caller_supplied_frontend_affinity_token() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        required_share_session_id = "share-session-test"
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id=required_share_session_id,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": required_share_session_id,
                "frontendAffinityToken": "frontend-b",
            },
            resolved_share_session_id=required_share_session_id,
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-share-origin-after-set"),
                section_id=None,
                frontend_affinity_token="frontend-a",
                allow_unscoped=True,
            ),
        )
        current_value_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)

        set_result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=not current_value_result.value,
            revealAfterSet=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.reveal is not None
        assert set_result.reveal.emittedRevealCount == 1
        assert set_result.reveal.statuses[0].status == "revealed"
        assert frontend_sender.resolved_target_websocket_ids[-1] == "frontend-a"
        assert frontend_sender.reveal_messages
        _, reveal_share_session_id = frontend_sender.reveal_messages[-1]
        assert reveal_share_session_id == required_share_session_id


@pytest.mark.asyncio
async def test_reveal_ui_setting_returns_structured_error_when_share_session_id_is_missing() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        manager = project_fixture.manager
        settings_manager = settings_fixture.manager
        strict_switcher = _ShareSessionStrictProjectManagerSwitcher(
            ProjectManagerSwitcher(
                main_manager=manager,
                settings_manager=settings_manager,
            ),
            required_share_session_id="required-share-session",
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_manager,
            frontend_sender=frontend_sender,
            project_manager_switcher=strict_switcher,
            request_meta={"projectConfigId": project_config_id},
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
        assert "Failed to resolve project manager" in result.statuses[0].error.message
        assert "Missing share session id" in result.statuses[0].error.message


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
        frontend_sender.connected_frontend_affinity_tokens = []
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
        frontend_sender.connected_frontend_affinity_tokens = [
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
async def test_reveal_ui_setting_fails_when_share_scope_is_ambiguous_without_affinity() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": "share-session-ambiguous",
                "frontendAffinityToken": "frontend-b",
            },
            resolved_share_session_id="share-session-ambiguous",
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
        assert "multiple frontends are connected" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_ui_setting_share_scope_succeeds_without_affinity_when_target_is_deterministic() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = None
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": "share-session-single-target",
            },
            resolved_share_session_id="share-session-single-target",
        )

        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        assert frontend_sender.resolved_target_websocket_ids[-1] == "frontend-a"


@pytest.mark.asyncio
async def test_reveal_ui_setting_share_scope_reports_no_frontend_without_affinity() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = []
        frontend_sender.reveal_target_websocket_id = None
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": "share-session-no-target",
            },
            resolved_share_session_id="share-session-no-target",
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
        assert "No connected frontend is available" in result.statuses[0].error.message


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_when_share_scope_affinity_token_is_invalid() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "shareSessionId": "share-session-invalid-token",
            },
            resolved_share_session_id="share-session-invalid-token",
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-share-invalid-token"),
                section_id=None,
                frontend_affinity_token="invalid-affinity-token",
                allow_unscoped=True,
            ),
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
        assert "invalid or no longer available" in result.statuses[0].error.message
        assert "invalid-affinity-token" in result.statuses[0].error.message
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_ui_setting_ignores_meta_share_session_id_in_ide_mode() -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={"shareSessionId": "caller-share-session"},
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
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "multiple frontends are connected" in result.statuses[0].error.message


@pytest.mark.asyncio
async def test_reveal_ui_setting_in_ide_mode_keeps_frontend_affinity_when_meta_has_share_session_id() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
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
                "shareSessionId": "caller-share-session",
                "frontendAffinityToken": "frontend-b",
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
async def test_reveal_ui_setting_prefers_frontend_affinity_token_from_request_meta() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
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
                "frontendAffinityToken": "frontend-b",
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
async def test_reveal_ui_setting_prefers_frontend_affinity_token_from_agentic_context_over_request_meta() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        frontend_sender.reveal_target_websocket_id = "frontend-b"
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-b",
            },
            agentic_context=AgenticContext(
                project_config_id=project_config_id,
                chat_id=ID("chat-agentic"),
                section_id=None,
                frontend_affinity_token="frontend-a",
                allow_unscoped=True,
            ),
        )

        # Agentic websocket affinity is canonical and must override request-meta fallback.
        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 1
        assert result.statuses[0].status == "revealed"
        assert frontend_sender.resolved_target_websocket_ids[-1] == "frontend-a"


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_when_preferred_frontend_websocket_is_missing() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
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
                "frontendAffinityToken": "frontend-missing",
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
async def test_reveal_ui_setting_fails_immediately_when_selected_frontend_becomes_undeliverable() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.undeliverable_target_websocket_ids = {"frontend-a"}
        project_config_id = ID(
            project_fixture.manager.project_state_backend.defaultProjectConfigId
        )
        ctx = _build_ctx(
            main_manager=project_fixture.manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
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
        assert "before reveal dispatch" in result.statuses[0].error.message
        assert "Timed out waiting for frontend reveal confirmation" not in (
            result.statuses[0].error.message
        )
        assert frontend_sender.reveal_messages == []
        reveal_result_hub = ctx.fastmcp.state.ui_setting_reveal_result_hub
        assert reveal_result_hub._waiters_by_request_id == {}


@pytest.mark.asyncio
async def test_reveal_right_pane_rolls_back_section_activation_when_dispatch_is_undeliverable() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.undeliverable_target_websocket_ids = {"frontend-a"}
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "before reveal dispatch" in result.statuses[0].error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages == []


@pytest.mark.asyncio
async def test_reveal_right_pane_rolls_back_section_activation_on_frontend_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.skip_reveal_result_resolution = True
        monkeypatch.setattr(
            ui_settings_tools_module,
            "_resolve_frontend_reveal_timeout_seconds",
            lambda _duration_ms: 0.01,
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            durationMs=250,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "Timed out waiting for frontend reveal confirmation" in (
            result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_reveal_right_pane_rolls_back_section_activation_on_frontend_disconnect() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.disconnect_after_dispatch_websocket_ids = {"frontend-a"}
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            durationMs=1000,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "disconnected before reveal confirmation" in (
            result.statuses[0].error.message
        )
        assert "Timed out waiting for frontend reveal confirmation" not in (
            result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_reveal_right_pane_timeout_does_not_clobber_newer_active_selection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.skip_reveal_result_resolution = True
        monkeypatch.setattr(
            ui_settings_tools_module,
            "_resolve_frontend_reveal_timeout_seconds",
            lambda _duration_ms: 0.05,
        )
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        first_section_result = await manager.create_top_level_section(
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
        second_section_result = await manager.create_top_level_section(
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
        first_section_id = first_section_result.sectionId
        second_section_id = second_section_result.sectionId
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
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        reveal_task = asyncio.create_task(
            reveal_ui_setting(
                settingId="core.project.show_param_display_names",
                sectionIdToActivate=first_section_id,
                durationMs=250,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
        )

        dispatch_observed = False
        for _ in range(40):
            if frontend_sender.reveal_messages:
                dispatch_observed = True
                break
            await asyncio.sleep(0.005)
        assert dispatch_observed
        current_state_before_manual_selection = manager.get_single_config_state(
            project_config_id
        )
        assert current_state_before_manual_selection.projectConfig.activeIds == []

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[second_section_id],
            )
        )

        result = await reveal_task
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "Timed out waiting for frontend reveal confirmation" in (
            result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [second_section_id]


@pytest.mark.asyncio
async def test_reveal_right_pane_timeout_does_not_rollback_after_newer_same_target_reveal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.skip_reveal_result_resolution = True
        monkeypatch.setattr(
            ui_settings_tools_module,
            "_resolve_frontend_reveal_timeout_seconds",
            lambda _duration_ms: 0.05,
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        first_reveal_task = asyncio.create_task(
            reveal_ui_setting(
                settingId="core.project.show_param_display_names",
                sectionIdToActivate=section_id,
                durationMs=250,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
        )

        dispatch_observed = False
        for _ in range(40):
            if frontend_sender.reveal_messages:
                dispatch_observed = True
                break
            await asyncio.sleep(0.005)
        assert dispatch_observed
        current_state_before_second_reveal = manager.get_single_config_state(
            project_config_id
        )
        assert current_state_before_second_reveal.projectConfig.activeIds == []

        # The newer reveal to the same target should supersede rollback ownership.
        frontend_sender.skip_reveal_result_resolution = False
        second_reveal_result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            durationMs=250,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert second_reveal_result.emittedRevealCount == 1
        assert second_reveal_result.statuses[0].status == "revealed"

        first_reveal_result = await first_reveal_task
        assert first_reveal_result.emittedRevealCount == 0
        assert first_reveal_result.statuses[0].status == "failed"
        assert first_reveal_result.statuses[0].error is not None
        assert "Timed out waiting for frontend reveal confirmation" in (
            first_reveal_result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []


@pytest.mark.asyncio
async def test_reveal_right_pane_timeout_does_not_rollback_after_user_aba_navigation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.skip_reveal_result_resolution = True
        monkeypatch.setattr(
            ui_settings_tools_module,
            "_resolve_frontend_reveal_timeout_seconds",
            lambda _duration_ms: 0.05,
        )
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        first_section_result = await manager.create_top_level_section(
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
        second_section_result = await manager.create_top_level_section(
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
        first_section_id = first_section_result.sectionId
        second_section_id = second_section_result.sectionId
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
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        reveal_task = asyncio.create_task(
            reveal_ui_setting(
                settingId="core.project.show_param_display_names",
                sectionIdToActivate=first_section_id,
                durationMs=250,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
        )

        dispatch_observed = False
        for _ in range(40):
            if frontend_sender.reveal_messages:
                dispatch_observed = True
                break
            await asyncio.sleep(0.005)
        assert dispatch_observed
        current_state_before_manual_navigation = manager.get_single_config_state(
            project_config_id
        )
        assert current_state_before_manual_navigation.projectConfig.activeIds == []

        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[second_section_id],
            )
        )
        await manager.set_active_ids(
            SetActiveIdsRequest(
                projectConfigId=project_config_id,
                activeIds=[first_section_id],
            )
        )

        result = await reveal_task
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "Timed out waiting for frontend reveal confirmation" in (
            result.statuses[0].error.message
        )
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == [first_section_id]


@pytest.mark.asyncio
async def test_reveal_right_pane_rolls_back_section_activation_when_frontend_status_is_missing() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.override_reveal_statuses = [
            UISettingRevealResultStatus(
                settingId="core.watch_code.enabled",
                status="revealed",
                errorCode=None,
                errorMessage=None,
            )
        ]
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "setting id mismatch" in result.statuses[0].error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_closed_when_frontend_ack_project_mismatches(
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.override_reveal_project_config_id = ID("project-mismatch")
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        started_at = monotonic()
        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            durationMs=250,
            ctx=ctx,
        )
        elapsed_seconds = monotonic() - started_at
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert elapsed_seconds < 1.0
        assert "project mismatch" in result.statuses[0].error.message


@pytest.mark.asyncio
async def test_reveal_ui_setting_fails_closed_when_frontend_ack_websocket_mismatches(
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = [
            "frontend-a",
            "frontend-b",
        ]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.override_reveal_from_websocket_id = "frontend-b"
        manager = project_fixture.manager
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        started_at = monotonic()
        result = await reveal_ui_setting(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            durationMs=250,
            ctx=ctx,
        )
        elapsed_seconds = monotonic() - started_at
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert elapsed_seconds < 1.0
        assert "websocket mismatch" in result.statuses[0].error.message


@pytest.mark.asyncio
async def test_reveal_right_pane_rolls_back_section_activation_on_frontend_failed_status() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.forced_status_by_setting_id[
            "core.project.show_param_display_names"
        ] = UISettingRevealResultStatus(
            settingId="core.project.show_param_display_names",
            status="failed",
            errorCode="mutation_failed",
            errorMessage="Quick Info anchor not found.",
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta={
                "projectConfigId": project_config_id,
                "frontendAffinityToken": "frontend-a",
            },
        )

        result = await reveal_ui_setting(
            settingId="core.project.show_param_display_names",
            sectionIdToActivate=section_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.emittedRevealCount == 0
        assert result.statuses[0].status == "failed"
        assert result.statuses[0].error is not None
        assert "Quick Info anchor not found." in result.statuses[0].error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
        assert frontend_sender.reveal_messages


@pytest.mark.asyncio
async def test_set_ui_setting_value_reveal_after_set_rolls_back_section_on_undeliverable_dispatch() -> (
    None
):
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        frontend_sender = _RecordingFrontendSender()
        frontend_sender.connected_frontend_affinity_tokens = ["frontend-a"]
        frontend_sender.reveal_target_websocket_id = "frontend-a"
        frontend_sender.undeliverable_target_websocket_ids = {"frontend-a"}
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
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
            request_meta=_RequestMetaModel(
                projectConfigId=project_config_id,
                sectionId=section_id,
                frontendAffinityToken="frontend-a",
            ),
        )
        current_value_result = await get_ui_setting_value(
            settingId="core.project.show_param_display_names",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)

        set_result = await set_ui_setting_value(
            settingId="core.project.show_param_display_names",
            value=not current_value_result.value,
            revealAfterSet=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.reveal is not None
        assert set_result.reveal.emittedRevealCount == 0
        assert set_result.reveal.statuses[0].status == "failed"
        assert set_result.reveal.statuses[0].error is not None
        assert "before reveal dispatch" in set_result.reveal.statuses[0].error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.activeIds == []
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
async def test_set_ui_setting_value_core_watch_code_enabled_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.watch_code.enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)
        old_value = bool(current_value_result.value)
        concurrent_value = not old_value
        original_compare = manager.compare_and_set_watch_code_enabled

        async def _simulate_concurrent_watch_code_write(
            x: SetWatchCodeEnabledRequest,
            *,
            expected_old_value: bool | None = None,
        ) -> tuple[bool, bool]:
            await manager.set_watch_code_enabled(
                SetWatchCodeEnabledRequest(
                    projectConfigId=x.projectConfigId,
                    enabled=concurrent_value,
                )
            )
            return await original_compare(
                x,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_watch_code_enabled",
            _simulate_concurrent_watch_code_write,
        )

        result = await set_ui_setting_value(
            settingId="core.watch_code.enabled",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.watchCodeEnabled == concurrent_value


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_project_name_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.project.name",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        old_name = current_value_result.value
        concurrent_name = f"{old_name}-concurrent"
        original_compare = manager.compare_and_set_project_config_name

        async def _simulate_concurrent_project_name_write(
            target_project_config_id: ID,
            new_name: str,
            *,
            expected_old_value: str | None = None,
        ) -> tuple[str, str]:
            await manager.set_project_config_name(
                target_project_config_id,
                concurrent_name,
            )
            return await original_compare(
                target_project_config_id,
                new_name,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_project_config_name",
            _simulate_concurrent_project_name_write,
        )

        result = await set_ui_setting_value(
            settingId="core.project.name",
            value=old_name,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_state = manager.get_single_config_state(project_config_id)
        assert updated_state.projectConfig.name == concurrent_name


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_project_name_commits_broadcast_and_save(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.project.name",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        new_name = f"{current_value_result.value}-tool-rename"
        broadcast_calls = 0
        original_broadcast_all_project_metadata = manager.broadcast_all_project_metadata

        async def _record_broadcast_all_project_metadata() -> None:
            nonlocal broadcast_calls
            broadcast_calls += 1
            await original_broadcast_all_project_metadata()

        monkeypatch.setattr(
            manager,
            "broadcast_all_project_metadata",
            _record_broadcast_all_project_metadata,
        )

        result = await set_ui_setting_value(
            settingId="core.project.name",
            value=new_name,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is None
        assert result.newValue == new_name
        assert broadcast_calls == 1
        persisted_project_state = project_fixture.dbe.read_project()
        assert (
            persisted_project_state.projectConfigs[project_config_id].name == new_name
        )


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_python_codegen_enabled_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, bool)
        old_value = bool(current_value_result.value)
        concurrent_value = not old_value
        original_compare = manager.compare_and_set_python_codegen_enabled

        async def _simulate_concurrent_python_codegen_write(
            target_project_config_id: ID,
            enabled: bool,
            *,
            expected_old_value: bool | None = None,
        ) -> tuple[bool, bool]:
            await original_compare(
                target_project_config_id,
                concurrent_value,
                expected_old_value=None,
            )
            return await original_compare(
                target_project_config_id,
                enabled,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_python_codegen_enabled",
            _simulate_concurrent_python_codegen_write,
        )

        result = await set_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_value_result = await get_ui_setting_value(
            settingId="core.run_instructions.python_codegen_enabled",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_value_result.error is None
        assert updated_value_result.value == concurrent_value


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_app_catalog_id_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.app.catalog_id",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        old_value = current_value_result.value
        concurrent_value = "setta.app.concurrent"
        if concurrent_value == old_value:
            concurrent_value = "setta.app.concurrent.alt"
        original_compare = manager.compare_and_set_app_definition_catalog_id

        async def _simulate_concurrent_app_catalog_write(
            *,
            catalog_id: str,
            expected_old_value: str | None = None,
        ) -> tuple[str, str]:
            app_definition = (
                manager.project_state_backend.appDefinition or AppDefinition()
            )
            manager.project_state_backend = manager.project_state_backend.model_copy(
                update={
                    "appDefinition": app_definition.model_copy(
                        update={"catalogId": concurrent_value}
                    )
                }
            )
            return await original_compare(
                catalog_id=catalog_id,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_app_definition_catalog_id",
            _simulate_concurrent_app_catalog_write,
        )

        result = await set_ui_setting_value(
            settingId="core.app.catalog_id",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_value_result = await get_ui_setting_value(
            settingId="core.app.catalog_id",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_value_result.error is None
        assert updated_value_result.value == concurrent_value


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_app_spec_version_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.app.spec_version",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        old_value = current_value_result.value
        concurrent_value = "v2"
        if concurrent_value == old_value:
            concurrent_value = "v3"
        original_compare = manager.compare_and_set_app_definition_spec_version

        async def _simulate_concurrent_app_spec_version_write(
            *,
            app_spec_version: str,
            expected_old_value: str | None = None,
        ) -> tuple[str, str]:
            await original_compare(
                app_spec_version=concurrent_value,
                expected_old_value=None,
            )
            return await original_compare(
                app_spec_version=app_spec_version,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_app_definition_spec_version",
            _simulate_concurrent_app_spec_version_write,
        )

        result = await set_ui_setting_value(
            settingId="core.app.spec_version",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_value_result = await get_ui_setting_value(
            settingId="core.app.spec_version",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_value_result.error is None
        assert updated_value_result.value == concurrent_value


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_app_spec_path_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.app.spec_path",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        old_value = current_value_result.value
        concurrent_value = "app_specs/concurrent-app-spec.json"
        if concurrent_value == old_value:
            concurrent_value = "app_specs/concurrent-app-spec-2.json"
        original_compare = manager.compare_and_set_app_definition_spec_path

        async def _simulate_concurrent_app_spec_path_write(
            *,
            app_spec_path: str,
            expected_old_value: str | None = None,
        ) -> tuple[str, str]:
            await original_compare(
                app_spec_path=concurrent_value,
                expected_old_value=None,
            )
            return await original_compare(
                app_spec_path=app_spec_path,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_app_definition_spec_path",
            _simulate_concurrent_app_spec_path_write,
        )

        result = await set_ui_setting_value(
            settingId="core.app.spec_path",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_value_result = await get_ui_setting_value(
            settingId="core.app.spec_path",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_value_result.error is None
        assert updated_value_result.value == concurrent_value


@pytest.mark.asyncio
async def test_set_ui_setting_value_core_app_theme_mode_rejects_stale_precondition_without_clobber(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with (
        real_project_manager() as project_fixture,
        real_settings_manager() as settings_fixture,
    ):
        manager = project_fixture.manager
        frontend_sender = _RecordingFrontendSender()
        ctx = _build_ctx(
            main_manager=manager,
            settings_manager=settings_fixture.manager,
            frontend_sender=frontend_sender,
        )
        project_config_id = ID(manager.project_state_backend.defaultProjectConfigId)
        current_value_result = await get_ui_setting_value(
            settingId="core.app.theme_mode",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert current_value_result.error is None
        assert isinstance(current_value_result.value, str)
        old_value = current_value_result.value
        concurrent_value = "dark" if old_value != "dark" else "light"
        original_compare = manager.compare_and_set_app_definition_theme_mode

        async def _simulate_concurrent_app_theme_mode_write(
            *,
            theme_mode: str,
            expected_old_value: str | None = None,
        ) -> tuple[str, str]:
            await original_compare(theme_mode=concurrent_value, expected_old_value=None)
            return await original_compare(
                theme_mode=theme_mode,
                expected_old_value=expected_old_value,
            )

        monkeypatch.setattr(
            manager,
            "compare_and_set_app_definition_theme_mode",
            _simulate_concurrent_app_theme_mode_write,
        )

        result = await set_ui_setting_value(
            settingId="core.app.theme_mode",
            value=old_value,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert result.error is not None
        assert result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in result.error.message
        updated_value_result = await get_ui_setting_value(
            settingId="core.app.theme_mode",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert updated_value_result.error is None
        assert updated_value_result.value == concurrent_value


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
async def test_plugin_ui_setting_flow_succeeds_with_pending_restart_runtime_state(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
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
        manifest_payload.pop("backend", None)
        manifest_path.write_text(
            json.dumps(manifest_payload, indent=2) + "\n",
            encoding="utf-8",
        )
        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"enabled": False, "label": "unset"},
        )
        original_get_runtime_response = plugin_manager.get_runtime_response

        def _runtime_response_with_pending_restart():
            runtime_response = original_get_runtime_response()
            for status_entry in runtime_response.status.plugins:
                if status_entry.pluginId != plugin_id:
                    continue
                if status_entry.state == PluginRuntimeState.active:
                    status_entry.state = PluginRuntimeState.pending_restart
            return runtime_response

        monkeypatch.setattr(
            plugin_manager,
            "get_runtime_response",
            _runtime_response_with_pending_restart,
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

        # pending_restart should remain operational for search/get/set/reveal.
        search_result = search_ui_settings(
            query="full fixture enabled",
            sourceFilter="plugin",
            limit=50,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert plugin_setting_id in [entry.settingId for entry in search_result.results]

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

        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert reveal_result.statuses[0].status == "revealed"
        assert reveal_result.statuses[0].error is None


@pytest.mark.asyncio
async def test_plugin_ui_setting_flow_succeeds_when_shadowed_status_precedes_active(
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
        original_get_runtime_response = plugin_manager.get_runtime_response

        def _runtime_response_with_shadowed_then_active():
            runtime_response = original_get_runtime_response()
            for index, status_entry in enumerate(runtime_response.status.plugins):
                if status_entry.pluginId != plugin_id:
                    continue
                shadowed_entry = status_entry.model_copy(
                    update={
                        "state": PluginRuntimeState.shadowed,
                        "shadowedBySourcePath": "/tmp/shadowed-plugin",
                    }
                )
                runtime_response.status.plugins.insert(index, shadowed_entry)
                break
            return runtime_response

        monkeypatch.setattr(
            plugin_manager,
            "get_runtime_response",
            _runtime_response_with_shadowed_then_active,
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

        # A leading shadowed row must not mask the active runtime row.
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
        assert set_result.newValue is True

        reveal_result = await reveal_ui_setting(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert reveal_result.emittedRevealCount == 1
        assert reveal_result.statuses[0].status == "revealed"
        assert reveal_result.statuses[0].error is None


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
async def test_plugin_schema_set_rejects_stale_precondition_without_clobbering_newer_value(
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

        original_compare_and_write = (
            plugin_manager.compare_and_write_plugin_config_path_value
        )

        def _simulate_concurrent_writer(
            *,
            plugin_id: str,
            setting_id: str,
            config_path: list[str],
            default_value: object,
            value: object,
            expected_old_value: object | None = None,
            validate_old_value=None,
        ) -> tuple[object, object]:
            plugin_manager.write_plugin_config(
                plugin_id=plugin_id,
                config={"enabled": True, "label": "updated-by-other-writer"},
            )
            return original_compare_and_write(
                plugin_id=plugin_id,
                setting_id=setting_id,
                config_path=config_path,
                default_value=default_value,
                value=value,
                expected_old_value=expected_old_value,
                validate_old_value=validate_old_value,
            )

        monkeypatch.setattr(
            plugin_manager,
            "compare_and_write_plugin_config_path_value",
            _simulate_concurrent_writer,
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

        # A stale precondition must fail without overwriting the latest committed config.
        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=False,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "mutation_failed"
        assert "changed since pre-write validation" in set_result.error.message

        plugin_entry = next(
            entry
            for entry in plugin_manager.get_runtime_response().list.plugins
            if entry.pluginId == plugin_id
        )
        assert plugin_entry.config.currentConfig["enabled"] is True
        assert plugin_entry.config.currentConfig["label"] == "updated-by-other-writer"


@pytest.mark.asyncio
async def test_plugin_schema_set_same_value_is_noop_without_save_or_rescan(
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

        save_plugins_state_calls = 0
        rescan_calls = 0
        original_save_plugins_state = plugin_manager._save_plugins_state
        original_rescan = plugin_manager.rescan

        def _count_save_plugins_state_calls(state_file) -> None:
            nonlocal save_plugins_state_calls
            save_plugins_state_calls += 1
            original_save_plugins_state(state_file)

        def _count_rescan_calls() -> None:
            nonlocal rescan_calls
            rescan_calls += 1
            original_rescan()

        monkeypatch.setattr(
            plugin_manager,
            "_save_plugins_state",
            _count_save_plugins_state_calls,
        )
        monkeypatch.setattr(plugin_manager, "rescan", _count_rescan_calls)

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

        # Same-value writes should be true no-ops in schema-backed CAS paths.
        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=False,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is None
        assert set_result.changed is False
        assert set_result.oldValue is False
        assert set_result.newValue is False
        assert save_plugins_state_calls == 0
        assert rescan_calls == 0


@pytest.mark.asyncio
async def test_plugin_backend_set_same_value_is_noop_without_backend_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
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

        write_handler_calls = 0
        original_invoke_handler = plugin_manager._invoke_backend_ui_setting_handler

        def _count_backend_write_handler_calls(
            *,
            plugin_id: str,
            handler_id: str,
            operation: str,
            project_config_id: str,
            value: object,
        ) -> object:
            nonlocal write_handler_calls
            if operation == "write":
                write_handler_calls += 1
            return original_invoke_handler(
                plugin_id=plugin_id,
                handler_id=handler_id,
                operation=operation,
                project_config_id=project_config_id,
                value=value,
            )

        monkeypatch.setattr(
            plugin_manager,
            "_invoke_backend_ui_setting_handler",
            _count_backend_write_handler_calls,
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
        plugin_setting_id = f"plugin::{plugin_id}::backend_enabled"

        try:
            # Same-value backend CAS writes should not invoke write handlers.
            set_result = await set_ui_setting_value(
                settingId=plugin_setting_id,
                value=False,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert set_result.error is None
            assert set_result.changed is False
            assert set_result.oldValue is False
            assert set_result.newValue is False
            assert write_handler_calls == 0
        finally:
            plugin_manager.shutdown_backend_plugins()


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
        assert "non-object node at <root>" in set_result.error.message
        assert target_plugin.config.currentConfig == "invalid-root"


@pytest.mark.asyncio
async def test_plugin_set_ui_setting_value_rejects_persisted_corrupt_config_root_without_rewrite(
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
        config_key = plugin_manager._plugin_config_key(
            plugin_id=plugin_id,
            scope=PluginScope.workspace,
        )
        plugins_state = plugin_manager._load_plugins_state()
        plugins_state.pluginConfigById[config_key] = "invalid-root"
        plugin_manager._save_plugins_state(plugins_state)
        plugin_manager.rescan()

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

        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert set_result.error is not None
        assert set_result.error.code == "plugin_unavailable"
        assert "state=invalid" in set_result.error.message
        reloaded_plugins_state = plugin_manager._load_plugins_state()
        assert reloaded_plugins_state.pluginConfigById[config_key] == "invalid-root"


@pytest.mark.asyncio
async def test_plugin_get_and_set_ui_setting_value_share_same_corrupt_root_error(
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
        schema_payload["required"] = []
        schema_path.write_text(
            json.dumps(schema_payload, indent=2) + "\n",
            encoding="utf-8",
        )

        plugin_manager.rescan()
        plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config={"label": "unset"},
        )
        config_key = plugin_manager._plugin_config_key(
            plugin_id=plugin_id,
            scope=PluginScope.workspace,
        )
        plugins_state = plugin_manager._load_plugins_state()
        plugins_state.pluginConfigById[config_key] = "invalid-root"
        plugin_manager._save_plugins_state(plugins_state)
        plugin_manager.rescan()

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

        # Read and write should surface the same fail-fast corruption diagnostics.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        set_result = await set_ui_setting_value(
            settingId=plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert set_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert set_result.error.code == "plugin_unavailable"
        assert get_result.error.message == set_result.error.message
        assert "state=invalid" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_get_ui_setting_value_reports_corrupt_config_structure(
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
        original_get_runtime_response = plugin_manager.get_runtime_response

        def _runtime_response_with_corrupt_config():
            runtime_response = original_get_runtime_response()
            for plugin_entry in runtime_response.list.plugins:
                if plugin_entry.pluginId != plugin_id:
                    continue
                plugin_entry.config.currentConfig = "invalid-root"
            return runtime_response

        monkeypatch.setattr(
            plugin_manager,
            "get_runtime_response",
            _runtime_response_with_corrupt_config,
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

        # Corrupt structures should surface explicit failures instead of default fallback.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "mutation_failed"
        assert "non-object node at <root>" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_get_ui_setting_value_returns_default_for_missing_leaf_key(
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
        original_get_runtime_response = plugin_manager.get_runtime_response

        def _runtime_response_with_missing_leaf():
            runtime_response = original_get_runtime_response()
            for plugin_entry in runtime_response.list.plugins:
                if plugin_entry.pluginId != plugin_id:
                    continue
                plugin_entry.config.currentConfig = {}
            return runtime_response

        monkeypatch.setattr(
            plugin_manager,
            "get_runtime_response",
            _runtime_response_with_missing_leaf,
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

        # Missing leaves should still resolve to schema defaults.
        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is None
        assert get_result.value is False


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
        plugin_result_ids = [entry.settingId for entry in plugin_results.results]
        assert plugin_setting_id not in plugin_result_ids
        assert f"plugin::{plugin_id}::label" in plugin_result_ids
        healthy_plugin_results = search_ui_settings(
            query="full label",
            sourceFilter="plugin",
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        healthy_result_ids = [
            entry.settingId for entry in healthy_plugin_results.results
        ]
        assert f"plugin::{plugin_id}::label" in healthy_result_ids

        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert "defaultValue is invalid" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_schema_tracks_multiple_invalid_entries_per_setting_id(
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
        raw_entries = schema_payload.get("x-setta-ui-settings")
        if not isinstance(raw_entries, list):
            raise ValueError(
                "Fixture plugin schema is missing x-setta-ui-settings list."
            )
        if len(raw_entries) < 2:
            raise ValueError("Fixture plugin schema is missing required entries.")
        first_entry = dict(raw_entries[0])
        first_entry["defaultValue"] = "not-a-boolean-default"
        second_entry = dict(raw_entries[1])
        second_entry["settingId"] = "invalid_label"
        second_entry["defaultValue"] = False
        third_entry = dict(raw_entries[1])
        third_entry["settingId"] = "label_copy"
        third_entry["synonyms"] = ["label copy"]
        third_entry["defaultValue"] = "unset"
        schema_payload["x-setta-ui-settings"] = [
            first_entry,
            second_entry,
            third_entry,
        ]
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

        first_invalid_setting_id = f"plugin::{plugin_id}::enabled"
        second_invalid_setting_id = f"plugin::{plugin_id}::invalid_label"
        healthy_setting_id = f"plugin::{plugin_id}::label_copy"

        first_invalid_result = await get_ui_setting_value(
            settingId=first_invalid_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert first_invalid_result.error is not None
        assert first_invalid_result.error.code == "plugin_unavailable"

        second_invalid_result = await get_ui_setting_value(
            settingId=second_invalid_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert second_invalid_result.error is not None
        assert second_invalid_result.error.code == "plugin_unavailable"

        healthy_result = await get_ui_setting_value(
            settingId=healthy_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert healthy_result.error is None
        assert healthy_result.value == "unset"


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
async def test_plugin_backend_ui_setting_write_rolls_back_invalid_post_write_value(
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
            "    if value is True:\n"
            "        _STATE['enabled'] = 'invalid-value'\n"
            "    else:\n"
            "        _STATE['enabled'] = bool(value)\n"
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
            set_result = await set_ui_setting_value(
                settingId=plugin_setting_id,
                value=True,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert set_result.error is not None
            assert set_result.error.code == "mutation_failed"
            assert "Rollback restored the previous value." in set_result.error.message

            get_result = await get_ui_setting_value(
                settingId=plugin_setting_id,
                projectConfigId=project_config_id,
                ctx=ctx,
            )
            assert get_result.error is None
            assert get_result.value is False
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
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        manifest_path = plugin_root / "setta.plugin.json"
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_payload.pop("backend", None)
        manifest_path.write_text(
            json.dumps(manifest_payload, indent=2) + "\n",
            encoding="utf-8",
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
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        manifest_path = plugin_root / "setta.plugin.json"
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_payload.pop("backend", None)
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
        plugin_id, plugin_root = _copy_fixture_plugin_to_workspace(
            manager=plugin_manager,
            fixture_name="full",
        )
        manifest_path = plugin_root / "setta.plugin.json"
        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_payload.pop("backend", None)
        manifest_path.write_text(
            json.dumps(manifest_payload, indent=2) + "\n",
            encoding="utf-8",
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
        plugin_result_ids = [entry.settingId for entry in plugin_results.results]
        assert plugin_setting_id not in plugin_result_ids
        assert f"plugin::{plugin_id}::label" in plugin_result_ids

        get_result = await get_ui_setting_value(
            settingId=plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert get_result.error is not None
        assert get_result.error.code == "plugin_unavailable"
        assert "duplicated ui settingId" in get_result.error.message


@pytest.mark.asyncio
async def test_plugin_unknown_setting_id_is_not_masked_by_other_invalid_contributions(
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
        known_invalid_setting_id = f"plugin::{plugin_id}::enabled"
        unknown_setting_id = f"plugin::{plugin_id}::unknown_setting"
        unknown_plugin_setting_id = "plugin::totally-missing-plugin::enabled"

        # Known-invalid contributions should keep plugin_unavailable diagnostics.
        known_invalid_get_result = await get_ui_setting_value(
            settingId=known_invalid_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert known_invalid_get_result.error is not None
        assert known_invalid_get_result.error.code == "plugin_unavailable"

        # Unknown setting ids in the same plugin namespace should still resolve as unknown.
        unknown_get_result = await get_ui_setting_value(
            settingId=unknown_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unknown_get_result.error is not None
        assert unknown_get_result.error.code == "setting_not_found"

        unknown_set_result = await set_ui_setting_value(
            settingId=unknown_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unknown_set_result.error is not None
        assert unknown_set_result.error.code == "setting_not_found"

        unknown_plugin_get_result = await get_ui_setting_value(
            settingId=unknown_plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unknown_plugin_get_result.error is not None
        assert unknown_plugin_get_result.error.code == "setting_not_found"

        unknown_plugin_set_result = await set_ui_setting_value(
            settingId=unknown_plugin_setting_id,
            value=True,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unknown_plugin_set_result.error is not None
        assert unknown_plugin_set_result.error.code == "setting_not_found"

        unknown_plugin_reveal_result = await reveal_ui_setting(
            settingId=unknown_plugin_setting_id,
            projectConfigId=project_config_id,
            ctx=ctx,
        )
        assert unknown_plugin_reveal_result.statuses[0].error is not None
        assert (
            unknown_plugin_reveal_result.statuses[0].error.code
            == "setting_not_found"
        )


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
