from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
import pytest

from setta.database.db_objs import DBE
from setta.routers.agentic import (
    CreateExternalAgentConfigRequest,
    CreatePromptTemplateRequest,
    DeleteExternalAgentConfigRequest,
    DeletePromptTemplateRequest,
    UpdateExternalAgentConfigRequest,
    UpdatePromptTemplateRequest,
    route_create_external_agent_config,
    route_create_prompt_template,
    route_delete_external_agent_config,
    route_delete_prompt_template,
    route_update_external_agent_config,
    route_update_prompt_template,
)
from setta.routers.dependencies import require_full_ide_runtime, require_ide_mode
from setta.routers.settings import SaveSettingsRequest, route_save_settings
from setta.server_state import SettaFastAPIState
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.prompt import PromptTemplate
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType
from tests.utils.runtime_context import runtime_context


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> None:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())


def _write_share_policy(root: Path, *, allow_llm: bool) -> None:
    dbe = DBE(root)
    policy = SharePolicy(allowLLM=allow_llm)
    dbe.write_json(root / "policy.json", policy.model_dump())


async def _build_state(root: Path) -> SettaFastAPIState:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        share_mode=True,
        share_deployment_root=root,
    )
    await state.wait_until_ready()
    return state


@pytest.mark.asyncio
async def test_share_mode_blocks_settings_save() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-ide-block-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        state = await _build_state(root)
        session = state.share_session_store.create_session()

        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_save_settings(
                    SaveSettingsRequest(settings=SettingsState()),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_ide_mode_rejects_share_state() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-ide-block-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        state = await _build_state(root)

        with pytest.raises(HTTPException) as exc:
            require_ide_mode(state)
        assert exc.value.status_code == 403


def test_require_full_ide_runtime_rejects_launcher_state() -> None:
    state = SimpleNamespace(deployment_mode=False, launcher_mode=True)
    with pytest.raises(HTTPException) as exc:
        require_full_ide_runtime(state)
    assert exc.value.status_code == 403
    assert exc.value.detail == "Launcher mode does not allow this endpoint."


@pytest.mark.asyncio
async def test_share_mode_blocks_prompt_template_mutations() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-ide-prompt-block-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        _write_share_policy(root, allow_llm=True)
        state = await _build_state(root)
        session = state.share_session_store.create_session()

        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_create_prompt_template(
                    CreatePromptTemplateRequest(
                        name="Greeting",
                        description="Greeting template",
                        template="Hello {{ name }}",
                    ),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert (
            exc.value.detail
            == "Share mode does not allow creating prompt templates."
        )

        template = PromptTemplate(
            name="Greeting",
            description="Greeting template",
            template="Hello {{ name }}",
        )
        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_update_prompt_template(
                    UpdatePromptTemplateRequest(template=template),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert (
            exc.value.detail
            == "Share mode does not allow updating prompt templates."
        )

        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_delete_prompt_template(
                    DeletePromptTemplateRequest(templateId=template.id),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert (
            exc.value.detail
            == "Share mode does not allow deleting prompt templates."
        )


@pytest.mark.asyncio
async def test_share_mode_blocks_external_agent_config_mutations() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-ide-external-agent-block-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        _write_share_policy(root, allow_llm=True)
        state = await _build_state(root)
        session = state.share_session_store.create_session()

        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_create_external_agent_config(
                    CreateExternalAgentConfigRequest(
                        name="Codex app-server",
                        toolType=ExternalAgentToolType.codex,
                        runMode=ExternalAgentRunMode.app_server,
                    ),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert exc.value.detail == "Deployment LLM support is not enabled."

        config = ExternalAgentConfig(
            name="Codex app-server",
            toolType=ExternalAgentToolType.codex,
            runMode=ExternalAgentRunMode.app_server,
            workingDirStrategy=ExternalAgentWorkingDirStrategy.project_root,
        )
        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_update_external_agent_config(
                    UpdateExternalAgentConfigRequest(config=config),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert exc.value.detail == "Deployment LLM support is not enabled."

        with pytest.raises(HTTPException) as exc:
            with runtime_context(state, session.id) as runtime_ctx:
                await route_delete_external_agent_config(
                    DeleteExternalAgentConfigRequest(configId=config.id),
                    runtime_ctx,
                )
        assert exc.value.status_code == 403
        assert exc.value.detail == "Deployment LLM support is not enabled."
