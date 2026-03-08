from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from fastapi import FastAPI, HTTPException
import pytest

from setta.database.db_objs import DBE
from setta.routers.app_deployments import route_get_latest_app_deployment
from setta.routers.share_deployments import route_get_latest_share_deployment
from setta.server_state import SettaFastAPIState
from setta.types.app_definition import AppDefinition
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy
from setta.utils.constants import C


def _write_share_project(
    deployment_root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> None:
    deployment_root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(deployment_root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = deployment_root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    dbe.write_json(deployment_root / "policy.json", SharePolicy().model_dump())


def _write_app_project(
    deployment_root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
    app_spec_payload: dict[str, Any] | None = None,
) -> None:
    deployment_root.mkdir(parents=True, exist_ok=True)
    dbe = DBE(deployment_root)
    project_config = ProjectConfig(name=project_config_name)
    app_spec_path = "app_specs/app.json"
    spec_payload = app_spec_payload or {"root": {"key": "root", "type": "Stack"}}
    dbe.write_json(deployment_root / app_spec_path, spec_payload)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
        appDefinition=AppDefinition(appSpecPath=app_spec_path),
    )
    dbe.write_project(project_state)
    deployment_name = deployment_root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.app,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    dbe.write_json(deployment_root / "policy.json", SharePolicy().model_dump())


@contextmanager
def _override_deployments_root(root: Path):
    original = C.DEPLOYMENTS_FOLDER
    C.DEPLOYMENTS_FOLDER = root
    try:
        yield
    finally:
        C.DEPLOYMENTS_FOLDER = original


pytestmark = pytest.mark.asyncio


async def test_share_deployment_mode_does_not_scan_disk_for_app_latest() -> None:
    with TemporaryDirectory() as tmpdir:
        deployments_root = Path(tmpdir) / "deployments"
        share_root = deployments_root / "share-server" / "v1"
        _write_share_project(
            share_root,
            project_config_name="share-server",
            deployment_version=share_root.name,
        )
        app_root = deployments_root / "leaky-app" / "v1"
        _write_app_project(
            app_root,
            project_config_name="leaky-app",
            deployment_version=app_root.name,
        )

        with _override_deployments_root(deployments_root):
            state = SettaFastAPIState(
                FastAPI(),
                share_mode=True,
                share_deployment_root=share_root,
            )
            await state.wait_until_ready()

            with pytest.raises(HTTPException) as exc:
                route_get_latest_app_deployment("leaky-app", state)
            assert exc.value.status_code == 404


async def test_app_deployment_mode_does_not_scan_disk_for_share_latest() -> None:
    with TemporaryDirectory() as tmpdir:
        deployments_root = Path(tmpdir) / "deployments"
        app_root = deployments_root / "app-server" / "v1"
        _write_app_project(
            app_root,
            project_config_name="app-server",
            deployment_version=app_root.name,
        )
        share_root = deployments_root / "leaky-share" / "v1"
        _write_share_project(
            share_root,
            project_config_name="leaky-share",
            deployment_version=share_root.name,
        )

        with _override_deployments_root(deployments_root):
            state = SettaFastAPIState(
                FastAPI(),
                app_mode=True,
                share_deployment_root=app_root,
            )
            await state.wait_until_ready()

            with pytest.raises(HTTPException) as exc:
                route_get_latest_share_deployment("leaky-share", state)
            assert exc.value.status_code == 404

