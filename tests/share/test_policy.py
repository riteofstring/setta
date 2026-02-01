from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

import pytest
from setta.database.db_objs import DBE
from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState
from setta.share.policy import deny_in_share_mode
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy, DeploymentType


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
    manifest = ShareDeploymentManifest(
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



@pytest.mark.asyncio
class TestSharePolicyEnforcement:
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_param_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=False))
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with pytest.raises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowParamChanges",
                    denied_message="Share policy disallows parameter changes.",
                )

            assert raised.value.status_code == 403

    async def test_variant_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowVariantChanges=False))
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with pytest.raises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowVariantChanges",
                    denied_message="Share policy disallows variant changes.",
                )

            assert raised.value.status_code == 403

    async def test_layout_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=False))
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with pytest.raises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowLayoutChanges",
                    denied_message="Share policy disallows layout changes.",
                )

            assert raised.value.status_code == 403

    async def test_structural_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with pytest.raises(HTTPException) as raised:
                await deny_in_share_mode(
                    share_mode=runtime_ctx.share_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Share mode disallows structural changes.",
                    share_session_id=runtime_ctx.share_session_id,
                )

            assert raised.value.status_code == 403

    async def test_lsp_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with pytest.raises(HTTPException) as raised:
                await deny_in_share_mode(
                    share_mode=runtime_ctx.share_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Share mode disallows language server features.",
                    share_session_id=runtime_ctx.share_session_id,
                )

            assert raised.value.status_code == 403
