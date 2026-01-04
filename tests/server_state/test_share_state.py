import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI

from setta.database.db_objs import DBE
from setta.mcp.client import MultiMCPClient
from setta.project_state.share_project_manager import ShareProjectManager
from setta.share.chat_manager import ShareChatManager
from setta.server_state import SettaFastAPIState
from setta.share.session_store import MemorySessionStore
from setta.terminals.terminals import Terminals
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
) -> ProjectConfig:
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
    return project_config


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


class ShareStateTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_share_state_boots_without_watchers(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share_test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            self.assertIsInstance(state.share_session_store, MemorySessionStore)
            self.assertIsInstance(state.share_project_manager, ShareProjectManager)
            self.assertEqual(
                project_config.id,
                state.share_project_manager.project_state_backend.defaultProjectConfigId,
            )
            self.assertFalse(state.specific_file_watcher)
            self.assertTrue(state.mcp_client.disabled)
            self.assertFalse(state.lsps)

    async def test_share_state_does_not_seed_settings_or_llm_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share_test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            self.assertFalse((root / "setta-settings.json").exists())
            self.assertFalse((root / "setta-settings-project.json").exists())
            self.assertFalse((root / "llm_config.json").exists())
            self.assertFalse((root / "llm_config.example.json").exists())

            self.assertIsNotNone(state.settings_file)

    async def test_share_state_uses_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share_test_dir"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            manifest_name = "share_test_manifest"
            manifest_version = "v99"
            _write_share_project(
                root,
                project_config_name=manifest_name,
                deployment_version=manifest_version,
            )
            state = await self._build_state(root)

            deployment_root = root.resolve()
            runtime_root = state.dbe.runtime_root
            self.assertNotEqual(runtime_root, deployment_root)
            self.assertEqual(
                Path(tmpdir).resolve()
                / "share_deployments"
                / "share_runtime"
                / manifest_name
                / manifest_version,
                runtime_root,
            )
            self.assertTrue(state.dbe.temporary_id_map.is_relative_to(runtime_root))
            self.assertFalse(state.dbe.temporary_id_map.is_relative_to(deployment_root))

    async def test_share_state_uses_manifest_for_relocated_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "relocated_root" / "project_alpha" / "v1"
            root.mkdir(parents=True, exist_ok=True)
            manifest_name = "relocated_manifest"
            manifest_version = "v42"
            _write_share_project(
                root,
                project_config_name=manifest_name,
                deployment_version=manifest_version,
            )
            state = await self._build_state(root)

            expected = (
                root.parent / "share_runtime" / manifest_name / manifest_version
            ).resolve()
            self.assertEqual(expected, state.dbe.runtime_root)

    def test_share_state_requires_project_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            app = FastAPI()
            with self.assertRaises(FileNotFoundError):
                SettaFastAPIState(
                    app,
                    share_mode=True,
                    share_deployment_root=root,
                )

    async def test_share_state_policy_gates_services(self) -> None:
        scenarios = [
            (
                "no-llm-no-mcp-no-run",
                SharePolicy(allowLLM=False, allowMCP=False, allowRun=False),
                False,
                False,
                False,
            ),
            (
                "llm-only",
                SharePolicy(allowLLM=True, allowMCP=False, allowRun=False),
                True,
                False,
                False,
            ),
            (
                "mcp-only",
                SharePolicy(allowLLM=False, allowMCP=True, allowRun=False),
                False,
                True,
                False,
            ),
            (
                "llm-mcp-run",
                SharePolicy(allowLLM=True, allowMCP=True, allowRun=True),
                True,
                True,
                True,
            ),
        ]

        for label, policy, expect_llm, expect_mcp, expect_run in scenarios:
            with self.subTest(label=label):
                with TemporaryDirectory() as tmpdir:
                    project_config_name = "share_test"
                    root = _build_share_deployment_root(tmpdir, project_config_name)
                    _write_share_project(
                        root,
                        project_config_name=project_config_name,
                        deployment_version=root.name,
                    )
                    _write_share_policy(root, policy)
                    state = await self._build_state(root)
                    self.assertFalse((root / "llm_config.json").exists())
                    self.assertFalse((root / "llm_config.example.json").exists())

                    if expect_llm:
                        self.assertIsInstance(state.chat_manager, ShareChatManager)
                    else:
                        self.assertFalse(state.chat_manager)

                    if expect_mcp:
                        self.assertIsInstance(state.mcp_client, MultiMCPClient)
                        self.assertFalse(state.mcp_client.disabled)
                        await state.mcp_client.stop()
                    else:
                        self.assertTrue(state.mcp_client.disabled)

                    if expect_run:
                        self.assertIsInstance(state.terminals, Terminals)
                    else:
                        self.assertFalse(state.terminals)
