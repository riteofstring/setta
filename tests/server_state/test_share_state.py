from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi import FastAPI
from setta.database.db_objs import DBE
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.server_state import SettaFastAPIState
from setta.share.session_store import MemorySessionStore
from setta.terminals.terminals import Terminals
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
    deployment_name: str | None = None,
    deployment_version: str,
) -> ProjectConfig:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    resolved_deployment_name = deployment_name or root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=resolved_deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


@pytest.mark.asyncio
class TestShareState:
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_share_state_boots_with_watchers(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share_test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            assert isinstance(state.share_session_store, MemorySessionStore)
            assert isinstance(state.share_runtime_state, ShareRuntimeState)
            assert (
                project_config.id
                == state.share_runtime_state.project_state_backend.defaultProjectConfigId
            )
            assert state.specific_file_watcher is not None
            assert state.mcp_client.disabled
            assert not state.lsps

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

            assert not (root / "setta-settings.json").exists()
            assert not (root / "setta-settings-project.json").exists()
            assert not (root / "llm_config.json").exists()
            assert not (root / "llm_config.example.json").exists()

            assert state.settings_file is not None

    async def test_share_state_uses_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share_test_dir"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            manifest_name = "share_test_manifest"
            manifest_version = "v99"
            _write_share_project(
                root,
                project_config_name=manifest_name,
                deployment_name=manifest_name,
                deployment_version=manifest_version,
            )
            state = await self._build_state(root)

            deployment_root = root.resolve()
            runtime_root = state.dbe.runtime_root
            assert runtime_root != deployment_root
            assert (
                Path(tmpdir).resolve()
                / "share_deployments"
                / "share_runtime"
                / manifest_name
                / manifest_version
                == runtime_root
            )
            assert state.dbe.temporary_id_map.is_relative_to(runtime_root)
            assert not state.dbe.temporary_id_map.is_relative_to(deployment_root)

    async def test_share_state_uses_manifest_for_relocated_runtime_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "relocated_root" / "project_alpha" / "v1"
            root.mkdir(parents=True, exist_ok=True)
            manifest_name = "relocated_manifest"
            manifest_version = "v42"
            _write_share_project(
                root,
                project_config_name=manifest_name,
                deployment_name=manifest_name,
                deployment_version=manifest_version,
            )
            state = await self._build_state(root)

            expected = (
                root.parent / "share_runtime" / manifest_name / manifest_version
            ).resolve()
            assert expected == state.dbe.runtime_root

    def test_share_state_requires_project_file(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            app = FastAPI()
            with pytest.raises(FileNotFoundError):
                SettaFastAPIState(
                    app,
                    share_mode=True,
                    share_deployment_root=root,
                )

    @pytest.mark.parametrize(
        ("policy", "expect_run"),
        [
            (SharePolicy(allowLLM=False, allowRun=False), False),
            (SharePolicy(allowLLM=True, allowRun=False), False),
            (SharePolicy(allowLLM=True, allowRun=True), True),
        ],
        ids=["no-llm-no-run", "llm-only", "llm-run"],
    )
    async def test_share_state_policy_gates_services(
        self, policy: SharePolicy, expect_run: bool
    ) -> None:
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
            assert not (root / "llm_config.json").exists()
            assert not (root / "llm_config.example.json").exists()

            assert state.agent_runner.disabled

            assert state.mcp_client.disabled

            if expect_run:
                assert isinstance(state.terminals, Terminals)
            else:
                assert not state.terminals
