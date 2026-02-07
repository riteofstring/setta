from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI
import pytest

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.routers.terminals import DeleteTerminalsRequest, route_delete_terminals
from setta.server_state import SettaFastAPIState
from setta.terminals.terminals import build_terminal_id
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType
from tests.utils.runtime_context import runtime_context


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
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
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


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
async def test_delete_terminals_scopes_to_share_session() -> None:
    with TemporaryDirectory() as tmpdir:
        project_config_name = "share-terminals-test"
        root = _build_share_deployment_root(tmpdir, project_config_name)
        project_config_id = _write_share_project(
            root,
            project_config_name=project_config_name,
            deployment_version=root.name,
        )
        _write_share_policy(root, SharePolicy(allowRun=True))
        state = await _build_state(root)
        session_a = state.share_session_store.create_session()
        session_b = state.share_session_store.create_session()
        section_id = create_new_id()
        terminal_id_a = build_terminal_id(section_id, session_a.id)
        terminal_id_b = build_terminal_id(section_id, session_b.id)

        state.terminals.new_terminal(
            project_config_id,
            terminal_id_a,
            share_session_id=session_a.id,
        )
        state.terminals.new_terminal(
            project_config_id,
            terminal_id_b,
            share_session_id=session_b.id,
        )
        try:
            with runtime_context(state, session_a.id) as runtime_ctx:
                await route_delete_terminals(
                    DeleteTerminalsRequest(sectionIds=[section_id]),
                    runtime_ctx,
                )

            assert terminal_id_a not in state.terminals.PTY_PIDS
            assert terminal_id_b in state.terminals.PTY_PIDS
        finally:
            await state.terminals.delete_terminals([terminal_id_a, terminal_id_b])
