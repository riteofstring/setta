import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.runtime.context import RuntimeContext
from setta.server_state import SettaFastAPIState
from setta.share.policy import deny_in_share_mode, resolve_section_ids_for_artifacts
from setta.types.artifact import ImageArtifact
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import ImageSectionImpl
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy
from setta.utils.utils import normalize_path


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


def _build_image_project_state(
    project_config_id: ID,
    section_id: ID,
    image_path: str,
) -> ProjectStateSingleConfig:
    image_impl = ImageSectionImpl(
        id=ID("image-impl"),
        name="Image",
        imagePath=image_path,
    )
    variant = Variant(
        id=ID("image-variant"),
        name="Variant",
        impl=image_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(image_impl),
    )
    section = Core(
        id=section_id,
        name="Hero",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name="Share Project",
        sectionVariantMap={section.id: variant.id},
        topLevelSections={section.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section.id: section},
        sectionImpls={image_impl.id: image_impl},
        sectionVariants={variant.id: variant},
    )


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
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with self.assertRaises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowParamChanges",
                    denied_message="Share policy disallows parameter changes.",
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, raised.exception.status_code)

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
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with self.assertRaises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowVariantChanges",
                    denied_message="Share policy disallows variant changes.",
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, raised.exception.status_code)

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
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with self.assertRaises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowLayoutChanges",
                    denied_message="Share policy disallows layout changes.",
                    project_config_id=project_config_id,
                    section_ids=[create_new_id()],
                )

            self.assertEqual(403, raised.exception.status_code)

    async def test_structural_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with self.assertRaises(HTTPException) as raised:
                await deny_in_share_mode(
                    share_mode=runtime_ctx.share_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Share mode disallows structural changes.",
                    project_config_id=project_config_id,
                    share_session_id=runtime_ctx.share_session_id,
                )

            self.assertEqual(403, raised.exception.status_code)

    async def test_lsp_changes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            with self.assertRaises(HTTPException) as raised:
                await deny_in_share_mode(
                    share_mode=runtime_ctx.share_mode,
                    frontend_sender=runtime_ctx.frontend_sender,
                    message="Share mode disallows language server features.",
                    project_config_id=project_config_id,
                    share_session_id=runtime_ctx.share_session_id,
                )

            self.assertEqual(403, raised.exception.status_code)

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
            runtime_ctx = RuntimeContext(state, share_session_id="session-a")

            await runtime_ctx.enforce_policy(
                policy_flag="allowLayoutChanges",
                denied_message="Share policy disallows layout changes.",
                project_config_id=project_config_id,
                section_ids=[allowed_section_id],
            )

            with self.assertRaises(HTTPException) as raised:
                await runtime_ctx.enforce_policy(
                    policy_flag="allowLayoutChanges",
                    denied_message="Share policy disallows layout changes.",
                    project_config_id=project_config_id,
                    section_ids=[blocked_section_id],
                )

            self.assertEqual(403, raised.exception.status_code)

    def test_resolve_section_ids_for_artifacts(self) -> None:
        project_config_id = ID("artifact-project")
        section_id = ID("image-section")
        image_path = "artifacts/image.png"
        project_state = _build_image_project_state(
            project_config_id,
            section_id,
            image_path,
        )
        known = ImageArtifact(id=image_path, value="image-data")
        unknown = ImageArtifact(id="artifacts/unknown.png", value="missing")

        section_ids, unknown_paths = resolve_section_ids_for_artifacts(
            project_state,
            [known, unknown],
        )

        self.assertEqual({section_id}, set(section_ids))
        self.assertEqual(
            [str(normalize_path("artifacts/unknown.png"))],
            unknown_paths,
        )


if __name__ == "__main__":
    unittest.main()
