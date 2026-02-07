from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from setta.app.spec_store import default_app_spec_path, write_app_spec
from setta.database.db_objs import DBE
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.routers.app_deployments import (
    PublishAppDeploymentRequest,
    route_publish_app_deployment,
)
from setta.types.app_definition import AppDefinition
from setta.types.share_deployment import DeploymentType, SharePolicy
from setta.utils.constants import C

from tests.utils.manager_fixture import real_project_manager, real_settings_manager


@contextmanager
def _override_share_deployments_root(root: Path):
    original_share_root = C.DEPLOYMENTS_FOLDER
    C.DEPLOYMENTS_FOLDER = root
    try:
        yield
    finally:
        C.DEPLOYMENTS_FOLDER = original_share_root


async def _set_app_definition(
    project_root: Path,
    manager,
    *,
    app_spec_payload: dict,
    app_spec_path: str | None = None,
) -> str:
    resolved_path = app_spec_path or default_app_spec_path()
    dbe = DBE(project_root)
    write_app_spec(dbe, resolved_path, app_spec_payload)

    absolute_path = (project_root / resolved_path).resolve().as_posix()
    manager.project_state_backend = manager.project_state_backend.model_copy(
        update={"appDefinition": AppDefinition(appSpecPath=absolute_path)}
    )
    return absolute_path


async def _set_app_definition_relative(
    project_root: Path,
    manager,
    *,
    app_spec_payload: dict,
    app_spec_path: str | None = None,
) -> str:
    """Simulate the normal IDE storage format: appSpecPath relative to setta_files."""
    resolved_path = app_spec_path or default_app_spec_path()
    dbe = DBE(project_root)
    write_app_spec(dbe, resolved_path, app_spec_payload)

    manager.project_state_backend = manager.project_state_backend.model_copy(
        update={"appDefinition": AppDefinition(appSpecPath=resolved_path)}
    )
    return resolved_path


class TestAppDeploymentPublish:
    pytestmark = pytest.mark.asyncio

    async def test_requires_app_definition(self) -> None:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            if project_config_id is None:
                pytest.fail("Expected a default project config id for publishing.")

            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=switcher,
                share_mode=False,
            )

            with pytest.raises(HTTPException) as raised:
                await route_publish_app_deployment(
                    PublishAppDeploymentRequest(
                        deploymentName="app-deployment",
                        projectConfigId=project_config_id,
                    ),
                    state,
                )

            assert raised.value.status_code == 400

    async def test_requires_app_spec_path(self) -> None:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            if project_config_id is None:
                pytest.fail("Expected a default project config id for publishing.")

            project_fixture.manager.project_state_backend = (
                project_fixture.manager.project_state_backend.model_copy(
                    update={"appDefinition": AppDefinition()}
                )
            )

            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=switcher,
                share_mode=False,
            )

            with pytest.raises(HTTPException) as raised:
                await route_publish_app_deployment(
                    PublishAppDeploymentRequest(
                        deploymentName="app-deployment",
                        projectConfigId=project_config_id,
                    ),
                    state,
                )

            assert raised.value.status_code == 400

    async def test_publishes_app_deployment_with_spec_and_policy(self) -> None:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            if project_config_id is None:
                pytest.fail("Expected a default project config id for publishing.")

            app_spec_payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            await _set_app_definition(
                project_fixture.setta_root,
                project_fixture.manager,
                app_spec_payload=app_spec_payload,
            )

            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=switcher,
                share_mode=False,
            )

            deployments_root = project_fixture.setta_root / "share_deployments"
            overrides = {
                "allowParamChanges": True,
                "allowVariantChanges": False,
                "allowLayoutChanges": False,
                "allowRun": False,
                "allowLLM": False,
                "allowExternalLinks": False,
                "allowFileDownloads": False,
                "allowMultipleRuns": True,
            }

            with _override_share_deployments_root(deployments_root):
                metadata = await route_publish_app_deployment(
                    PublishAppDeploymentRequest(
                        deploymentName="app-deployment",
                        projectConfigId=project_config_id,
                        appPolicyOverrides=overrides,
                    ),
                    state,
                )

            deployment_dbe = DBE(metadata.deploymentRoot)
            manifest = deployment_dbe.read_deployment_manifest()
            assert manifest.deploymentType is DeploymentType.app

            snapshot = deployment_dbe.read_project_required()
            assert snapshot.appDefinition is not None
            app_spec_path = snapshot.appDefinition.appSpecPath
            assert app_spec_path is not None
            assert not Path(app_spec_path).is_absolute()
            deployed_spec_path = metadata.deploymentRoot / app_spec_path
            assert deployed_spec_path.exists()
            assert deployment_dbe.read_json(deployed_spec_path) == app_spec_payload

            share_policy_path = metadata.deploymentRoot / "share_policy.json"
            share_policy = SharePolicy.model_validate(
                deployment_dbe.read_json(share_policy_path)
            )
            assert share_policy.allowRun is False
            assert share_policy.allowParamChanges is True

    async def test_publishes_app_deployment_with_relative_app_spec_path(self) -> None:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            if project_config_id is None:
                pytest.fail("Expected a default project config id for publishing.")

            app_spec_payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            stored_path = await _set_app_definition_relative(
                project_fixture.setta_root,
                project_fixture.manager,
                app_spec_payload=app_spec_payload,
                app_spec_path="app_specs/custom.json",
            )

            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=switcher,
                share_mode=False,
            )

            deployments_root = project_fixture.setta_root / "share_deployments"
            with _override_share_deployments_root(deployments_root):
                metadata = await route_publish_app_deployment(
                    PublishAppDeploymentRequest(
                        deploymentName="app-deployment",
                        projectConfigId=project_config_id,
                    ),
                    state,
                )

            deployment_dbe = DBE(metadata.deploymentRoot)
            snapshot = deployment_dbe.read_project_required()
            assert snapshot.appDefinition is not None
            assert snapshot.appDefinition.appSpecPath == stored_path
            deployed_spec_path = metadata.deploymentRoot / stored_path
            assert deployed_spec_path.exists()
            assert deployment_dbe.read_json(deployed_spec_path) == app_spec_payload

    async def test_publishes_app_deployment_with_listener_entrypoint(self) -> None:
        async with (
            real_project_manager() as project_fixture,
            real_settings_manager() as settings_fixture,
        ):
            project_config_id = (
                project_fixture.manager.project_state_backend.defaultProjectConfigId
            )
            if project_config_id is None:
                pytest.fail("Expected a default project config id for publishing.")

            app_spec_payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            await _set_app_definition(
                project_fixture.setta_root,
                project_fixture.manager,
                app_spec_payload=app_spec_payload,
            )

            listener_source = project_fixture.setta_root.parent / "listener_entry.py"
            listener_source.write_text(
                "from setta.api import SettaListener\n\n"
                "def build_listener(listener: SettaListener) -> None:\n"
                "    return\n",
                encoding="utf-8",
            )

            switcher = ProjectManagerSwitcher(
                main_manager=project_fixture.manager,
                settings_manager=settings_fixture.manager,
            )
            state = SimpleNamespace(
                dbe=project_fixture.dbe,
                project_manager_switcher=switcher,
                share_mode=False,
            )

            deployments_root = project_fixture.setta_root / "share_deployments"
            with _override_share_deployments_root(deployments_root):
                metadata = await route_publish_app_deployment(
                    PublishAppDeploymentRequest(
                        deploymentName="app-deployment",
                        projectConfigId=project_config_id,
                        listenerEntrypoint=listener_source.as_posix(),
                        listenerEnabled=True,
                    ),
                    state,
                )

            deployment_dbe = DBE(metadata.deploymentRoot)
            manifest = deployment_dbe.read_deployment_manifest()
            assert manifest.listener is not None
            assert manifest.listener.entrypoint == "listener/app.py"
            assert manifest.listener.enabled is True

            deployed_listener = metadata.deploymentRoot / "listener" / "app.py"
            assert deployed_listener.exists()
            assert deployed_listener.read_text(encoding="utf-8") == listener_source.read_text(
                encoding="utf-8"
            )
