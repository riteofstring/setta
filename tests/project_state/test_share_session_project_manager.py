import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.code_gen.utils import sanitize_name
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
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
from setta.types.share_deployment import ShareDeploymentManifest
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
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _build_project_state(
    project_config_id: ID,
    gen_section_id: ID,
    code_section_id: ID,
) -> ProjectStateSingleConfig:
    project_config = ProjectConfig(
        id=project_config_id,
        name="Share Project",
        entryCodeBlockId=code_section_id,
    )
    project_slug = sanitize_name(project_config.name)
    code_root = Path("code") / "sections" / project_slug

    gen_binding = CodeFileBinding(
        canonical_path=code_root / "setta_gen.py",
        access_mode=CodeFileAccessMode.write_only,
    )
    gen_impl = GenPythonCodeSectionImpl(
        id=ID("gen-impl"),
        name="Generated",
        codeFileBinding=gen_binding,
    )
    gen_variant = Variant(
        id=ID("gen-variant"),
        name="Generated",
        impl=gen_impl.id,
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
        id=ID("code-impl"),
        name="Runner",
        code="print('hello')",
        codeFileBinding=code_binding,
    )
    code_variant = Variant(
        id=ID("code-variant"),
        name="Runner",
        impl=code_impl.id,
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
            gen_impl.id: gen_impl,
            code_impl.id: code_impl,
        },
        sectionVariants={
            gen_variant.id: gen_variant,
            code_variant.id: code_variant,
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
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_state.projectConfig.id,
        projectConfigName=project_state.projectConfig.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return dbe


class ShareSessionProjectManagerTests(unittest.IsolatedAsyncioTestCase):
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
            python_sender = WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=share_manager,
                settings_file=settings_file,
                python_script_sender=python_sender,
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
                state.projectConfig.genCodePrefix = "import math\n"
                await session_manager.update(state, updateFileWatcher=False)
                updated = share_manager.get_session_state(
                    "session-a", project_config_id
                )
                self.assertEqual("import math\n", updated.projectConfig.genCodePrefix)
            finally:
                session_manager.shutdown()
                results = await asyncio.gather(
                    session_manager.queue_task,
                    return_exceptions=True,
                )
                self.assertEqual(1, len(results))
                self.assertIsInstance(results[0], asyncio.CancelledError)


if __name__ == "__main__":
    unittest.main()
