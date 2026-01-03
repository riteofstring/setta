import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.server_state import SettaFastAPIState
from setta.share.policy import (
    ensure_share_layout_changes_allowed,
    ensure_share_param_changes_allowed,
    ensure_share_structural_changes_allowed,
    ensure_share_variant_changes_allowed,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy


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
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config.id,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


class SharePolicyEnforcementTests(unittest.IsolatedAsyncioTestCase):
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
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=False))
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                await ensure_share_param_changes_allowed(
                    state,
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, ctx.exception.status_code)

    async def test_variant_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowVariantChanges=False))
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                await ensure_share_variant_changes_allowed(
                    state,
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, ctx.exception.status_code)

    async def test_layout_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=False))
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                await ensure_share_layout_changes_allowed(
                    state,
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, ctx.exception.status_code)

    async def test_structural_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowStructuralChanges=False))
            state = await self._build_state(root)

            with self.assertRaises(HTTPException) as ctx:
                await ensure_share_structural_changes_allowed(
                    state,
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, ctx.exception.status_code)

    async def test_allowed_sections_gate(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            allowed_section_id = create_new_id()
            blocked_section_id = create_new_id()
            _write_share_policy(
                root,
                SharePolicy(
                    allowLayoutChanges=True,
                    allowedSections=[allowed_section_id],
                ),
            )
            state = await self._build_state(root)

            await ensure_share_layout_changes_allowed(
                state,
                project_config_id=project_config_id,
                section_ids=[allowed_section_id],
            )

            with self.assertRaises(HTTPException) as ctx:
                await ensure_share_layout_changes_allowed(
                    state,
                    project_config_id=project_config_id,
                    section_ids=[blocked_section_id],
                )

            self.assertEqual(403, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
