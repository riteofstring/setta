import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

import pytest
from setta.database.db_objs import DBE
from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState
from setta.share.policy import (
    deny_in_deployment_mode,
    ensure_share_download_allowed,
    ensure_share_multiple_runs_allowed,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType


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
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={project_config.id: {}},
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
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "policy.json", policy.model_dump())



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
                await deny_in_deployment_mode(
                    deployment_mode=runtime_ctx.deployment_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Deployment mode disallows structural changes.",
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
                await deny_in_deployment_mode(
                    deployment_mode=runtime_ctx.deployment_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Deployment mode disallows language server features.",
                    share_session_id=runtime_ctx.share_session_id,
                )

            assert raised.value.status_code == 403

    async def test_file_downloads_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowFileDownloads=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)

            with pytest.raises(HTTPException) as raised:
                await ensure_share_download_allowed(
                    state, share_session_id=session.id
                )

            assert raised.value.status_code == 403

    async def test_multiple_runs_blocked_after_first(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(
                root,
                SharePolicy(allowRun=True, allowMultipleRuns=False),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)

            await ensure_share_multiple_runs_allowed(
                state, share_session_id=session.id
            )

            with pytest.raises(HTTPException) as raised:
                await ensure_share_multiple_runs_allowed(
                    state, share_session_id=session.id
                )

            assert raised.value.status_code == 403

    async def test_multiple_run_reservation_is_atomic(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(
                root,
                SharePolicy(allowRun=True, allowMultipleRuns=False),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)

            results = await asyncio.gather(
                ensure_share_multiple_runs_allowed(state, share_session_id=session.id),
                ensure_share_multiple_runs_allowed(state, share_session_id=session.id),
                return_exceptions=True,
            )
            successes = [result for result in results if result is True]
            failures = [
                result for result in results if isinstance(result, HTTPException)
            ]
            assert len(successes) == 1
            assert len(failures) == 1
            assert failures[0].status_code == 403
