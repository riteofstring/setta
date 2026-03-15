import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from setta.code_gen.utils import sanitize_slug
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
    SingletonSections,
)
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
)
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


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


def _build_project_state(
    project_config_id: ID,
    gen_section_id: ID,
    code_section_id: ID,
    project_config_name: str | None = None,
) -> ProjectStateSingleConfig:
    resolved_name = project_config_name or "Share Project"
    project_config = ProjectConfig(
        id=project_config_id,
        name=resolved_name,
        entryCodeBlockId=code_section_id,
    )
    project_slug = sanitize_slug(project_config.name)
    code_root = Path("code") / "sections" / project_slug

    gen_binding = CodeFileBinding(
        canonical_path=code_root / "setta_gen.py",
        access_mode=CodeFileAccessMode.write_only,
    )
    gen_impl_id = ID(f"gen-impl-{project_config_id}")
    gen_variant_id = ID(f"gen-variant-{project_config_id}")
    code_impl_id = ID(f"code-impl-{project_config_id}")
    code_variant_id = ID(f"code-variant-{project_config_id}")
    gen_impl = GenPythonCodeSectionImpl(
        id=gen_impl_id,
        name="Generated",
        codeFileBinding=gen_binding,
    )
    gen_variant = Variant(
        id=gen_variant_id,
        name="Generated",
        impl=gen_impl_id,
        nonPresetImpls=compute_initial_nonPresetImpls(gen_impl),
    )
    gen_section = Core(
        id=gen_section_id,
        name="Generated",
        variants=[gen_variant.id],
        defaultVariant=gen_variant.id,
    )

    code_binding = CodeFileBinding(
        canonical_path=code_root / "runner.py",
        access_mode=CodeFileAccessMode.read_write,
    )
    code_impl = CodeSectionImpl(
        id=code_impl_id,
        name="Runner",
        code="print('hello')",
        codeFileBinding=code_binding,
    )
    code_variant = Variant(
        id=code_variant_id,
        name="Runner",
        impl=code_impl_id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
    )
    code_section = Core(
        id=code_section_id,
        name="Runner",
        variants=[code_variant.id],
        defaultVariant=code_variant.id,
    )

    project_config.sectionVariantMap = {
        gen_section_id: gen_variant.id,
        code_section_id: code_variant.id,
    }
    project_config.topLevelSections = {code_section_id: TopLevelSectionLayout()}

    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={
            gen_section_id: gen_section,
            code_section_id: code_section,
        },
        sectionImpls={
            gen_impl_id: gen_impl,
            code_impl_id: code_impl,
        },
        sectionVariants={
            gen_variant_id: gen_variant,
            code_variant_id: code_variant,
        },
        singletonSections=SingletonSections(GenPythonCode=gen_section_id),
        genCodeBinding=gen_binding,
    )


def _write_project_with_state(
    root: Path,
    project_state: ProjectStateSingleConfig,
    deployment_version: str = "v1",
) -> DBE:
    backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
    backend.defaultProjectConfigId = project_state.projectConfig.id
    dbe = DBE(root)
    dbe.write_project(backend)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_state.projectConfig.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    return dbe


def _write_project_with_states(
    root: Path,
    project_states: list[ProjectStateSingleConfig],
    default_project_config_id: ID | None = None,
    deployment_version: str = "v1",
) -> DBE:
    backend = ProjectStateBackend()
    for project_state in project_states:
        backend = merge_single_config_into_backend(backend, project_state)
    if not project_states:
        raise ValueError("Expected at least one project state")
    resolved_default_id = default_project_config_id or project_states[
        0
    ].projectConfig.id
    backend.defaultProjectConfigId = resolved_default_id
    dbe = DBE(root)
    dbe.write_project(backend)
    backend.projectConfigs[resolved_default_id]
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=resolved_default_id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    return dbe


@pytest.mark.asyncio
class TestShareSessionProjectManager:
    async def test_session_manager_supports_multiple_configs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_state_a = _build_project_state(
                ID("share-project-a"),
                ID("gen-section-a"),
                ID("code-section-a"),
                project_config_name="Share Project A",
            )
            project_state_b = _build_project_state(
                ID("share-project-b"),
                ID("gen-section-b"),
                ID("code-section-b"),
                project_config_name="Share Project B",
            )
            root = _build_share_deployment_root(
                tmpdir, project_state_a.projectConfig.name
            )
            dbe = _write_project_with_states(
                root,
                [project_state_a, project_state_b],
                default_project_config_id=project_state_a.projectConfig.id,
            )
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            share_manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            share_manager.initialize_share_state(settings_file)
            WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=share_manager,
                settings_file=settings_file,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )
            session_manager = switcher.get_for_session("session-a")

            try:
                await session_manager._process_queue_task_started.wait()
                state_a = session_manager.get_single_config_state(
                    project_state_a.projectConfig.id
                )
                state_b = session_manager.get_single_config_state(
                    project_state_b.projectConfig.id
                )
                assert (
                    project_state_a.projectConfig.name
                    == state_a.projectConfig.name
                )
                assert (
                    project_state_b.projectConfig.name
                    == state_b.projectConfig.name
                )
            finally:
                session_manager.shutdown()
                results = await asyncio.gather(
                    session_manager.queue_task,
                    return_exceptions=True,
                )
                assert 1 == len(results)
                assert isinstance(results[0], asyncio.CancelledError)

    async def test_update_without_lsp_does_not_raise(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            project_state = _build_project_state(
                ID("share-project"),
                ID("gen-section"),
                ID("code-section"),
            )
            dbe = _write_project_with_state(root, project_state, deployment_version="v1")
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(websocket_manager, share_mode=True)
            share_manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            share_manager.initialize_share_state(settings_file)
            WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=share_manager,
                settings_file=settings_file,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )
            session_manager = switcher.get_for_session("session-a")

            try:
                await session_manager._process_queue_task_started.wait()
                project_config_id = share_manager.default_project_config_id
                state = session_manager.get_single_config_state(
                    project_config_id
                )
                python_target = get_python_codegen_target_with_type_guard(
                    state.projectConfig
                )
                python_target.genCodePrefix = "import math\n"
                await session_manager.update(state, updateFileWatcher=False)
                updated = share_manager.get_session_state(
                    "session-a", project_config_id
                )
                updated_target = get_python_codegen_target_with_type_guard(
                    updated.projectConfig
                )
                assert "import math\n" == updated_target.genCodePrefix
            finally:
                session_manager.shutdown()
                results = await asyncio.gather(
                    session_manager.queue_task,
                    return_exceptions=True,
                )
                assert 1 == len(results)
                assert isinstance(results[0], asyncio.CancelledError)
