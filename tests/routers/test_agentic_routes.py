import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import HTTPException
import pytest

from setta.agentic.external_agent_defaults import (
    DEFAULT_CLAUDE_ALLOW_RULES,
    DEFAULT_CLAUDE_ASK_RULES,
    DEFAULT_OPENCODE_PERMISSION,
)
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
from setta.routers.agentic import (
    CreateAgentProfileRequest,
    CreateExternalAgentConfigRequest,
    CreatePromptTemplateRequest,
    CreateTranscriptionProfileRequest,
    DeleteAgentProfileRequest,
    DeleteExternalAgentConfigRequest,
    DeletePromptTemplateRequest,
    GetAgentProfileRequest,
    GetAgentRunRequest,
    GetExternalAgentConfigRequest,
    GetPromptTemplateRequest,
    StartAgentRunRequest,
    StopAgentRunRequest,
    UpdateAgentProfileRequest,
    UpdateExternalAgentConfigRequest,
    UpdatePromptTemplateRequest,
    UpdateTranscriptionProfileRequest,
    route_create_agent_profile,
    route_create_external_agent_config,
    route_create_prompt_template,
    route_create_transcription_profile,
    route_delete_agent_profile,
    route_delete_external_agent_config,
    route_delete_prompt_template,
    route_get_agent_profile,
    route_get_agent_profiles,
    route_get_agent_run,
    route_get_agent_runs,
    route_get_external_agent_config,
    route_get_external_agent_configs,
    route_get_prompt_template,
    route_get_prompt_templates,
    route_start_agent_run,
    route_stop_agent_run,
    route_update_agent_profile,
    route_update_external_agent_config,
    route_update_prompt_template,
    route_update_transcription_profile,
)
from setta.agentic.store import save_engine_configs
from setta.types.agentic import (
    AgentRunStatus,
    EngineConfig,
    EngineType,
    TranscriptionTransportMode,
)
from setta.types.external_agents import (
    ExternalAgentEnvVarStatus,
    ExternalAgentPreflightStatus,
    ExternalAgentRunMode,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.runtime_context import runtime_context


@dataclass(slots=True)
class _AgenticTestState:
    dbe: DBE
    share_mode: bool = False
    deployment_mode: bool = False
    share_runtime_state: None = None
    wmh_frontend_sender: WMHFrontendSender | None = None
    chat_manager: None = None
    agent_runner: AgentRunner | None = None
    external_agent_runner: object = field(
        default_factory=lambda: _DisabledExternalAgentRunner()
    )
    prompt_template_watcher: object | None = None


class _DisabledExternalAgentRunner:
    disabled = True

    def get_plugin_external_agent_adapters(
        self,
    ) -> list[PluginRegisteredExternalAgentAdapter]:
        return []

    def get_plugin_external_agent_adapter(
        self, _adapter_id: str | None
    ) -> PluginRegisteredExternalAgentAdapter | None:
        return None


class TestAgenticRoutes:
    pytestmark = pytest.mark.asyncio

    async def test_profile_crud_and_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            mcp_client = MultiMCPClient({}, disabled=True)
            agent_runner = AgentRunner(dbe, mcp_client, frontend_sender)
            agent_runner.update_config(
                AllLLMConfigs(
                    configs={
                        "planner-llm": LLMConfig(
                            id="planner-llm",
                            model="gpt-4o-mini",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        )
                },
                    mcpServers={},
                )
            )
            engine_config_id = ID("engine-planner")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="Planner Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="planner-llm",
                    )
                ],
            )
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                agent_runner=agent_runner,
            )

            with runtime_context(state) as ctx:
                profile = await route_create_agent_profile(
                    CreateAgentProfileRequest(
                        name="Planner",
                        description="Planner profile",
                        systemPrompt="Plan tasks",
                        engineConfigId=engine_config_id,
                        toolAllowlist=["tool.a"],
                        memoryScope="workspace",
                    ),
                    ctx,
                )

                profiles = await route_get_agent_profiles(ctx)
                assert len(profiles) == 1
                assert profiles[0].id == profile.id

                updated = profile.model_copy(update={"name": "Planner v2"})
                updated_profile = await route_update_agent_profile(
                    UpdateAgentProfileRequest(profile=updated),
                    ctx,
                )
                assert updated_profile.name == "Planner v2"

                fetched = await route_get_agent_profile(
                    GetAgentProfileRequest(profileId=profile.id),
                    ctx,
                )
                assert fetched.name == "Planner v2"

                run = await route_start_agent_run(
                    StartAgentRunRequest(
                        profileId=profile.id,
                        inputs={"prompt": "hello", "allowUnscoped": True},
                    ),
                    ctx,
                )
                assert run.status == AgentRunStatus.running

                fetched_run = await route_get_agent_run(
                    GetAgentRunRequest(runId=run.id),
                    ctx,
                )
                assert fetched_run.id == run.id

                stopped = await route_stop_agent_run(
                    StopAgentRunRequest(runId=run.id),
                    ctx,
                )
                assert stopped.status == AgentRunStatus.cancelled
                assert stopped.finishedAt is not None

                runs = await route_get_agent_runs(ctx)
                assert len(runs) == 1

                await route_delete_agent_profile(
                    DeleteAgentProfileRequest(profileId=profile.id),
                    ctx,
                )
                profiles = await route_get_agent_profiles(ctx)
                assert profiles == []

    async def test_transcription_profile_routes_validate_llm_config_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            mcp_client = MultiMCPClient({}, disabled=True)
            agent_runner = AgentRunner(dbe, mcp_client, frontend_sender)
            agent_runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="whisper-1",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        )
                    },
                    mcpServers={},
                )
            )
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                agent_runner=agent_runner,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as create_exc:
                    await route_create_transcription_profile(
                        CreateTranscriptionProfileRequest(
                            name="Invalid profile",
                            transcriptionLlmConfigId="missing-transcribe",
                            transportMode=TranscriptionTransportMode.file,
                            chunkMs=1200,
                            language=None,
                        ),
                        ctx,
                    )
                assert create_exc.value.status_code == 400
                assert (
                    create_exc.value.detail
                    == "Transcription profile references unknown transcription LLM config 'missing-transcribe'."
                )

                created = await route_create_transcription_profile(
                    CreateTranscriptionProfileRequest(
                        name="Valid profile",
                        transcriptionLlmConfigId="openai-transcribe",
                        transportMode=TranscriptionTransportMode.file,
                        chunkMs=1200,
                        language=None,
                    ),
                    ctx,
                )

                with pytest.raises(HTTPException) as update_exc:
                    await route_update_transcription_profile(
                        UpdateTranscriptionProfileRequest(
                            profile=created.model_copy(
                                update={"transcriptionLlmConfigId": "missing-transcribe"}
                            )
                        ),
                        ctx,
                    )
                assert update_exc.value.status_code == 400
                assert (
                    update_exc.value.detail
                    == "Transcription profile references unknown transcription LLM config 'missing-transcribe'."
                )

    async def test_prompt_template_crud(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
            )

            with runtime_context(state) as ctx:
                created = await route_create_prompt_template(
                    CreatePromptTemplateRequest(
                        name="Greeting",
                        description="Greeting template",
                        template="Hello {{ name }}",
                        inputSchema={"name": {"type": "string"}},
                        metadata={"category": "greeting"},
                    ),
                    ctx,
                )

                templates = await route_get_prompt_templates(ctx)
                assert len(templates) == 1
                assert templates[0].id == created.id

                fetched = await route_get_prompt_template(
                    GetPromptTemplateRequest(templateId=created.id),
                    ctx,
                )
                assert fetched.template == "Hello {{ name }}"

                updated = created.model_copy(
                    update={
                        "description": "Updated greeting",
                        "template": "Hey {{ name }}",
                    }
                )
                updated_template = await route_update_prompt_template(
                    UpdatePromptTemplateRequest(template=updated),
                    ctx,
                )
                assert updated_template.description == "Updated greeting"
                assert updated_template.template == "Hey {{ name }}"

                await route_delete_prompt_template(
                    DeletePromptTemplateRequest(templateId=updated_template.id),
                    ctx,
                )
                templates = await route_get_prompt_templates(ctx)
                assert templates == []

    async def test_external_agent_config_crud(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Codex app-server",
                        description="SDK-based Codex",
                        toolType=ExternalAgentToolType.codex,
                        runMode=ExternalAgentRunMode.app_server,
                        commandPath="/usr/local/bin/node",
                        defaultModel="o1-mini",
                        sandboxPolicy="read-only",
                        approvalPolicy="on-failure",
                        envVarWhitelist=["OPENAI_API_KEY"],
                        workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
                    ),
                    ctx,
                )

                configs = await route_get_external_agent_configs(ctx)
                assert len(configs) == 1
                assert configs[0].id == created.id

                fetched = await route_get_external_agent_config(
                    GetExternalAgentConfigRequest(configId=created.id),
                    ctx,
                )
                assert fetched.name == "Codex app-server"

                updated = created.model_copy(update={"name": "Codex app-server v2"})
                updated_config = await route_update_external_agent_config(
                    UpdateExternalAgentConfigRequest(config=updated),
                    ctx,
                )
                assert updated_config.name == "Codex app-server v2"

                await route_delete_external_agent_config(
                    DeleteExternalAgentConfigRequest(configId=updated.id),
                    ctx,
                )
                configs = await route_get_external_agent_configs(ctx)
                assert configs == []

                with pytest.raises(HTTPException):
                    await route_get_external_agent_config(
                        GetExternalAgentConfigRequest(configId=updated.id),
                        ctx,
                    )

    async def test_external_agent_config_supports_plugin_adapter_defaults(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

            class _Runner:
                disabled = False

                def get_plugin_external_agent_adapters(
                    self,
                ) -> list[PluginRegisteredExternalAgentAdapter]:
                    return [
                        PluginRegisteredExternalAgentAdapter(
                            adapterId="acme-plugin:openhands",
                            pluginId="acme-plugin",
                            name="OpenHands",
                            runModes=["sdk"],
                            command="openhands",
                            args=[],
                            envVarWhitelist=["OPENHANDS_API_KEY"],
                            defaultModel="openhands/default",
                        )
                    ]

                def get_plugin_external_agent_adapter(
                    self, adapter_id: str | None
                ) -> PluginRegisteredExternalAgentAdapter | None:
                    if adapter_id is None:
                        return None
                    normalized_adapter_id = adapter_id.strip()
                    for adapter in self.get_plugin_external_agent_adapters():
                        if adapter.adapterId == normalized_adapter_id:
                            return adapter
                    return None

            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                external_agent_runner=_Runner(),
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="OpenHands",
                        toolType=ExternalAgentToolType.plugin,
                        pluginAdapterId="acme-plugin:openhands",
                        runMode=ExternalAgentRunMode.sdk,
                    ),
                    ctx,
                )

                assert created.toolType == ExternalAgentToolType.plugin
                assert created.pluginAdapterId == "acme-plugin:openhands"
                assert created.defaultModel is None
                assert created.envVarWhitelist == []

                updated = await route_update_external_agent_config(
                    UpdateExternalAgentConfigRequest(
                        config=created.model_copy(
                            update={
                                "name": "OpenHands v2",
                                "defaultModel": None,
                                "envVarWhitelist": [],
                            }
                        )
                    ),
                    ctx,
                )
                assert updated.name == "OpenHands v2"
                assert updated.defaultModel is None
                assert updated.envVarWhitelist == []

    async def test_external_agent_config_uses_runner_lookup_for_plugin_adapter(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            adapter_registration = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:lookup-only",
                pluginId="acme-plugin",
                name="LookupOnly",
                runModes=["sdk"],
                command="lookup-only",
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )

            class _Runner:
                disabled = False

                def get_plugin_external_agent_adapters(
                    self,
                ) -> list[PluginRegisteredExternalAgentAdapter]:
                    # Route validation should not depend on this bulk list path.
                    return []

                def get_plugin_external_agent_adapter(
                    self, adapter_id: str | None
                ) -> PluginRegisteredExternalAgentAdapter | None:
                    if adapter_id is None:
                        return None
                    if adapter_id.strip() == adapter_registration.adapterId:
                        return adapter_registration
                    return None

            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                external_agent_runner=_Runner(),
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Lookup only adapter",
                        toolType=ExternalAgentToolType.plugin,
                        pluginAdapterId=adapter_registration.adapterId,
                        runMode=ExternalAgentRunMode.sdk,
                    ),
                    ctx,
                )

                assert created.toolType == ExternalAgentToolType.plugin
                assert created.pluginAdapterId == adapter_registration.adapterId

    async def test_external_agent_config_rejects_unknown_plugin_adapter(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)

            class _Runner:
                disabled = False

                def get_plugin_external_agent_adapters(
                    self,
                ) -> list[PluginRegisteredExternalAgentAdapter]:
                    return []

                def get_plugin_external_agent_adapter(
                    self, _adapter_id: str | None
                ) -> PluginRegisteredExternalAgentAdapter | None:
                    return None

            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                external_agent_runner=_Runner(),
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc_info:
                    await route_create_external_agent_config(
                        CreateExternalAgentConfigRequest(
                            name="Missing plugin adapter",
                            toolType=ExternalAgentToolType.plugin,
                            pluginAdapterId="acme-plugin:missing",
                            runMode=ExternalAgentRunMode.sdk,
                        ),
                        ctx,
                    )
                assert exc_info.value.status_code == 400
                assert "adapter not found" in str(exc_info.value.detail)

    async def test_external_agent_config_initializes_claude_settings_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Claude SDK",
                        toolType=ExternalAgentToolType.claude_code,
                        runMode=ExternalAgentRunMode.sdk,
                    ),
                    ctx,
                )

            assert (
                created.settingsMode
                == ExternalAgentSettingsMode.managed_local
            )
            assert created.settingsAllowSettaEdits

            settings_path = Path(tmpdir) / ".claude" / "settings.local.json"
            assert settings_path.exists()
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("allow") == DEFAULT_CLAUDE_ALLOW_RULES
                assert permissions.get("ask") == DEFAULT_CLAUDE_ASK_RULES

    async def test_external_agent_config_initializes_codex_settings_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Codex app-server",
                        toolType=ExternalAgentToolType.codex,
                        runMode=ExternalAgentRunMode.app_server,
                    ),
                    ctx,
                )

            assert created.approvalPolicy == "on-failure"
            assert created.sandboxPolicy == "workspace-write"

            settings_path = (
                setta_root
                / "external_agent_settings"
                / "codex"
                / str(created.id)
                / "config.toml"
            )
            assert settings_path.exists()
            payload = tomllib.loads(settings_path.read_text(encoding="utf-8"))
            assert payload.get("approval_policy") == "on-failure"
            assert payload.get("sandbox_mode") == "workspace-write"
            mcp_servers = payload.get("mcp_servers")
            assert isinstance(mcp_servers, dict)
            if isinstance(mcp_servers, dict):
                assert (
                    mcp_servers.get("setta", {}).get("url")
                    == f"{C.BACKEND}/mcp"
                )

    async def test_external_agent_config_initializes_opencode_settings_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="OpenCode SDK",
                        toolType=ExternalAgentToolType.opencode,
                        runMode=ExternalAgentRunMode.sdk,
                    ),
                    ctx,
                )

            settings_path = (
                setta_root
                / "external_agent_settings"
                / "opencode"
                / str(created.id)
                / "opencode.json"
            )
            assert settings_path.exists()
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            assert payload.get("permission") == DEFAULT_OPENCODE_PERMISSION
            mcp = payload.get("mcp")
            assert isinstance(mcp, dict)
            if isinstance(mcp, dict):
                assert mcp.get("setta", {}).get("url") == f"{C.BACKEND}/mcp"

    async def test_external_agent_run_blocks_on_preflight(self) -> None:
        class _Runner:
            disabled = False

            def get_plugin_external_agent_adapters(
                self,
            ) -> list[PluginRegisteredExternalAgentAdapter]:
                return []

            def get_plugin_external_agent_adapter(
                self, _adapter_id: str | None
            ) -> PluginRegisteredExternalAgentAdapter | None:
                return None

            def start_run(self, *_args, **_kwargs):
                raise AssertionError("start_run should not be called on preflight fail")

        class _AgentRunnerStub:
            disabled = True
            config = AllLLMConfigs(configs={}, mcpServers={})

        with TemporaryDirectory() as tmpdir:
            setta_root = Path(tmpdir) / "setta_files"
            setta_root.mkdir(parents=True, exist_ok=True)
            dbe = DBE(setta_root)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
            state = _AgenticTestState(
                dbe=dbe,
                wmh_frontend_sender=frontend_sender,
                agent_runner=_AgentRunnerStub(),
                external_agent_runner=_Runner(),
            )

            with runtime_context(state) as ctx:
                created = await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Codex app-server",
                        toolType=ExternalAgentToolType.codex,
                        runMode=ExternalAgentRunMode.app_server,
                    ),
                    ctx,
                )
                preflight = ExternalAgentPreflightStatus(
                    configId=created.id,
                    name=created.name,
                    toolType=created.toolType,
                    runMode=created.runMode,
                    supported=True,
                    available=False,
                    issues=["Missing env vars: OPENAI_API_KEY"],
                    envVars=ExternalAgentEnvVarStatus(),
                )
                with patch(
                    "setta.routers.agentic.build_external_agent_preflight_status",
                    return_value=preflight,
                ):
                    engine_config = EngineConfig(
                        name="Codex Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=created.id,
                    )
                    save_engine_configs(dbe, [engine_config])
                    profile = await route_create_agent_profile(
                        CreateAgentProfileRequest(
                            name="External Runner",
                            engineConfigId=engine_config.id,
                        ),
                        ctx,
                    )
                    with pytest.raises(HTTPException) as ctx_err:
                        await route_start_agent_run(
                            StartAgentRunRequest(
                                profileId=profile.id,
                                inputs={"prompt": "hello"},
                            ),
                            ctx,
                        )
                    assert ctx_err.value.status_code == 503
