import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from starlette.types import Message, Scope
from starlette.websockets import WebSocket
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.database.utils import create_new_id
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.code import build_python_snapshot_module_run_command
from setta.project_state.project_manager_types import RunCodeRequest
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.project_state.share_runtime_state import ShareRuntimeState
from setta.types.artifact import (
    ArtifactType,
    DrawAreaLayer,
    DrawAreaLayerItem,
    ImageArtifact,
)
from setta.types.binary_content import BinaryContentRef
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_config import (
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
    ChartSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
    TextBlockSectionImpl,
)
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType
from setta.utils.utils import GEN_CODE_META_FILENAME, normalize_path
from setta.types.websocket import WebsocketConnectionType
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender
from setta.websockets.websocket_manager import WebsocketManager


def _write_project(
    root: Path,
    project_configs: list[ProjectConfig],
    default_id: str | None,
) -> DBE:
    dbe = DBE(root)
    project_state = ProjectStateBackend(
        projectConfigs={config.id: config for config in project_configs},
        defaultProjectConfigId=default_id,
    )
    dbe.write_project(project_state)
    return dbe


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


async def _build_websocket(messages: list[Message]) -> WebSocket:
    receive_queue: list[Message] = [{"type": "websocket.connect"}]

    async def receive() -> Message:
        if receive_queue:
            return receive_queue.pop(0)
        return {"type": "websocket.receive"}

    async def send(message: Message) -> None:
        messages.append(message)

    scope: Scope = {
        "type": "websocket",
        "asgi": {"version": "3.0"},
        "scheme": "ws",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 0),
        "server": ("testserver", 80),
        "subprotocols": [],
    }
    return WebSocket(scope=scope, receive=receive, send=send)


def _sent_text_messages(messages: list[Message]) -> list[str]:
    return [
        message["text"]
        for message in messages
        if message.get("type") == "websocket.send" and "text" in message
    ]


def _build_project_state(
    project_config_id: ID,
    section_id: ID,
    project_config_name: str | None = None,
) -> ProjectStateSingleConfig:
    resolved_name = project_config_name or "Share Project"
    text_impl_id = ID(f"text-impl-{project_config_id}")
    variant_id = ID(f"text-variant-{project_config_id}")
    text_impl = TextBlockSectionImpl(
        id=text_impl_id,
        name="Headline",
        text="Initial text",
    )
    variant = Variant(
        id=variant_id,
        name="Variant",
        impl=text_impl_id,
        nonPresetImpls=compute_initial_nonPresetImpls(text_impl),
    )
    section = Core(
        id=section_id,
        name="Hero",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name=resolved_name,
        sectionVariantMap={section.id: variant.id},
        topLevelSections={section.id: TopLevelSectionLayout()},
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section.id: section},
        sectionImpls={text_impl_id: text_impl},
        sectionVariants={variant_id: variant},
    )


def _build_code_project_state(
    project_config_id: ID,
    section_id: ID,
    binding_path: Path,
) -> ProjectStateSingleConfig:
    code_binding = CodeFileBinding(
        canonical_path=binding_path,
        access_mode=CodeFileAccessMode.read_write,
    )
    code_impl = CodeSectionImpl(
        id=ID("code-impl"),
        name="Runner",
        code="print('hello')",
        codeFileBinding=code_binding,
    )
    variant = Variant(
        id=ID("code-variant"),
        name="Variant",
        impl=code_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
    )
    section = Core(
        id=section_id,
        name="Runner",
        variants=[variant.id],
        defaultVariant=variant.id,
    )
    project_config = ProjectConfig(
        id=project_config_id,
        name="Share Project",
        sectionVariantMap={section.id: variant.id},
        topLevelSections={section.id: TopLevelSectionLayout()},
        entryCodeBlockId=section.id,
    )
    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section.id: section},
        sectionImpls={code_impl.id: code_impl},
        sectionVariants={variant.id: variant},
    )


def _build_image_project_state(
    project_config_id: ID,
    section_id: ID,
    image_path: Path,
) -> ProjectStateSingleConfig:
    image_impl = ImageSectionImpl(
        id=ID("image-impl"),
        name="Image",
        imagePath=str(image_path),
    )
    variant = Variant(
        id=ID("image-variant"),
        name="Variant",
        impl=image_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(image_impl),
    )
    section = Core(
        id=section_id,
        name="Image",
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


def _write_project_with_state(
    root: Path,
    project_state: ProjectStateSingleConfig,
    deployment_version: str = "v1",
) -> DBE:
    backend = merge_single_config_into_backend(
        ProjectStateBackend(),
        project_state,
    )
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
    default_config = backend.projectConfigs[resolved_default_id]
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=resolved_default_id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return dbe


class TestShareRuntimeState:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        yield
        asyncio.set_event_loop(None)
        self._loop.close()

    def test_manifest_project_config_selection(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config_a = ProjectConfig(name="alpha")
            config_b = ProjectConfig(name="beta")
            root = _build_share_deployment_root(tmpdir, config_b.name)
            dbe = _write_project(root, [config_a, config_b], config_a.id)
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=config_b.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            assert config_b.id == manager.default_project_config_id

            manager.create_session_backend("session-a")
            session_state = manager.get_session_state("session-a", config_b.id)
            assert config_b.id == session_state.projectConfig.id

    def test_manifest_allows_relocated_deployment_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = ProjectConfig(name="alpha")
            root = Path(tmpdir) / "relocated" / "deployment_root"
            root.mkdir(parents=True, exist_ok=True)
            dbe = _write_project(root, [config], config.id)
            manifest = DeploymentManifest(
                version=1,
                deploymentName=config.name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=config.id,
                deploymentVersion="v42",
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            assert root.name != manifest.deploymentVersion
            assert root.parent.name != manifest.deploymentName

            frontend_sender = WMHFrontendSender(WebsocketManager())
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            assert config.name == manager.deployment_name
            assert manifest.deploymentVersion == manager.deployment_version

    def test_manifest_missing_project_config_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = ProjectConfig(name="alpha")
            root = _build_share_deployment_root(tmpdir, config.name)
            dbe = _write_project(root, [config], config.id)
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=create_new_id(),
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            with pytest.raises(KeyError):
                ShareRuntimeState(dbe, root, WMHFrontendSender(WebsocketManager()))

    def test_missing_project_configs_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "missing")
            dbe = DBE(root)
            dbe.write_project(ProjectStateBackend())
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=create_new_id(),
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            with pytest.raises(KeyError):
                ShareRuntimeState(dbe, root, WMHFrontendSender(WebsocketManager()))

    def test_missing_project_json_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "missing-project-json")
            dbe = DBE(root)
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=create_new_id(),
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            with pytest.raises(FileNotFoundError):
                ShareRuntimeState(dbe, root, WMHFrontendSender(WebsocketManager()))

    def test_session_state_does_not_preload_artifacts(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            relative_image_path = Path("artifacts") / "preview.png"
            image_path = root / relative_image_path
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"fake-image")
            project_config_id = ID("image-project")
            section_id = ID("image-section")
            project_state = _build_image_project_state(
                project_config_id, section_id, relative_image_path
            )
            dbe = _write_project_with_state(root, project_state)
            frontend_sender = WMHFrontendSender(WebsocketManager(), share_mode=True)
            manager = ShareRuntimeState(dbe, root, frontend_sender)

            manager.create_session_backend("session-a")
            artifacts = manager.get_session_artifacts("session-a")
            cached = artifacts.get_cached_image(image_path)

            assert cached is None

    def test_relative_canvas_paths_are_rebased(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            project_config_id = ID("canvas-project")
            chart_section_id = ID("chart-section")
            draw_section_id = ID("draw-section")
            chart_rel_path = Path("artifacts") / "chart.csv"
            draw_rel_path = Path("artifacts") / "draw.json"
            transform_rel_path = Path("artifacts") / "draw-transform.json"

            chart_impl = ChartSectionImpl(
                id=ID("chart-impl"),
                name="Chart",
                dataPath=str(chart_rel_path),
            )
            chart_variant = Variant(
                id=ID("chart-variant"),
                name="Variant",
                impl=chart_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(chart_impl),
            )
            chart_section = Core(
                id=chart_section_id,
                name="Chart",
                variants=[chart_variant.id],
                defaultVariant=chart_variant.id,
            )

            draw_item = DrawAreaLayerItem(
                type=ArtifactType.BrushStroke,
                dataPath=str(draw_rel_path),
                transformId=str(transform_rel_path),
            )
            draw_impl = DrawSectionImpl(
                id=ID("draw-impl"),
                name="Draw",
                layers=[DrawAreaLayer(elements=[draw_item])],
            )
            draw_variant = Variant(
                id=ID("draw-variant"),
                name="Variant",
                impl=draw_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(draw_impl),
            )
            draw_section = Core(
                id=draw_section_id,
                name="Draw",
                variants=[draw_variant.id],
                defaultVariant=draw_variant.id,
            )

            project_config = ProjectConfig(
                id=project_config_id,
                name="Share Project",
                sectionVariantMap={
                    chart_section_id: chart_variant.id,
                    draw_section_id: draw_variant.id,
                },
                topLevelSections={
                    chart_section_id: TopLevelSectionLayout(),
                    draw_section_id: TopLevelSectionLayout(),
                },
            )
            project_state = ProjectStateSingleConfig(
                projectConfig=project_config,
                sections={
                    chart_section_id: chart_section,
                    draw_section_id: draw_section,
                },
                sectionImpls={
                    chart_impl.id: chart_impl,
                    draw_impl.id: draw_impl,
                },
                sectionVariants={
                    chart_variant.id: chart_variant,
                    draw_variant.id: draw_variant,
                },
            )
            dbe = _write_project_with_state(root, project_state)
            frontend_sender = WMHFrontendSender(WebsocketManager(), share_mode=True)
            manager = ShareRuntimeState(dbe, root, frontend_sender)

            manager.create_session_backend("session-a")
            session_state = manager.get_session_state("session-a", project_config_id)
            chart_session_impl = get_curr_effective_section_impl_with_type_guard(
                session_state,
                chart_section_id,
                ChartSectionImpl,
            )
            draw_session_impl = get_curr_effective_section_impl_with_type_guard(
                session_state,
                draw_section_id,
                DrawSectionImpl,
            )

            expected_chart = str(normalize_path(root / chart_rel_path))
            expected_draw = str(normalize_path(root / draw_rel_path))
            expected_transform = str(normalize_path(root / transform_rel_path))
            assert expected_chart == chart_session_impl.dataPath
            assert 1 == len(draw_session_impl.layers)
            assert 1 == len(draw_session_impl.layers[0].elements)
            element = draw_session_impl.layers[0].elements[0]
            assert expected_draw == element.dataPath
            assert expected_transform == element.transformId

    def test_run_command_ephemeral_writes_share_snapshot(self, monkeypatch) -> None:
        with TemporaryDirectory() as tmpdir:
            monkeypatch.chdir(tmpdir)
            root = _build_share_deployment_root(tmpdir, "Share Project")
            project_config_id = ID("share-run-project")
            section_id = ID("code-section")
            binding_path = Path("code") / "runner.py"
            project_state = _build_code_project_state(
                project_config_id, section_id, binding_path
            )
            dbe = _write_project_with_state(root, project_state)
            dbe.write_json(
                root / "policy.json",
                SharePolicy(runSnapshotMode=RunSnapshotMode.ephemeral).model_dump(),
            )
            frontend_sender = WMHFrontendSender(WebsocketManager(), share_mode=True)
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            session_id = "session-ephemeral"
            manager.create_session_backend(session_id)
            runs_root = manager.share_runs_root
            run_request = RunCodeRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                cliId=None,
            )

            try:
                command = self._loop.run_until_complete(
                    manager.create_run_command(session_id, run_request)
                )

                run_root = runs_root / session_id
                assert run_root.exists()
                run_dirs = [path for path in run_root.iterdir() if path.is_dir()]
                assert 1 == len(run_dirs)
                run_dir = run_dirs[0]
                runner_path = run_dir / "runner.py"
                gen_path = run_dir / "setta_gen.py"
                meta_path = run_dir / GEN_CODE_META_FILENAME
                assert runner_path.exists()
                assert gen_path.exists()
                python_target = get_python_codegen_target_with_type_guard(
                    project_state.projectConfig
                )
                if python_target.generateMetadata:
                    assert meta_path.exists()
                else:
                    assert not meta_path.exists()
                assert "print('hello')" == runner_path.read_text(encoding="utf-8")
                expected = build_python_snapshot_module_run_command(
                    run_root, runner_path
                )
                assert expected == command
            finally:
                shutil.rmtree(runs_root, ignore_errors=True)

    def test_run_command_ephemeral_outside_cwd_uses_absolute_path(self) -> None:
        with TemporaryDirectory(dir=Path(tempfile.gettempdir())) as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            project_config_id = ID("share-run-project")
            section_id = ID("code-section")
            binding_path = Path("code") / "runner.py"
            project_state = _build_code_project_state(
                project_config_id, section_id, binding_path
            )
            dbe = _write_project_with_state(root, project_state)
            dbe.write_json(
                root / "policy.json",
                SharePolicy(runSnapshotMode=RunSnapshotMode.ephemeral).model_dump(),
            )
            frontend_sender = WMHFrontendSender(WebsocketManager(), share_mode=True)
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            session_id = "session-absolute"
            manager.create_session_backend(session_id)
            run_request = RunCodeRequest(
                projectConfigId=project_config_id,
                sectionId=section_id,
                cliId=None,
            )

            command = self._loop.run_until_complete(
                manager.create_run_command(session_id, run_request)
            )

            assert manager.share_runs_root.is_absolute()
            run_root = manager.share_runs_root / session_id
            run_dirs = [path for path in run_root.iterdir() if path.is_dir()]
            assert 1 == len(run_dirs)
            runner_path = run_dirs[0] / "runner.py"
            meta_path = run_dirs[0] / GEN_CODE_META_FILENAME
            assert runner_path.is_absolute()
            python_target = get_python_codegen_target_with_type_guard(
                project_state.projectConfig
            )
            if python_target.generateMetadata:
                assert meta_path.exists()
            else:
                assert not meta_path.exists()
            expected = build_python_snapshot_module_run_command(
                run_root, runner_path
            )
            assert expected == command

    def test_json_source_values_are_rehydrated(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            relative_json_path = Path("json_sources") / "source.json"
            json_path = root / relative_json_path
            json_path.parent.mkdir(parents=True, exist_ok=True)
            json_path.write_text('{"foo": 123}', encoding="utf-8")

            project_config_id = ID("json-project")
            section_id = ID("json-section")
            dict_impl = DictSectionImpl(
                id=ID("dict-impl"),
                name="Data",
                isJsonSource=True,
            )
            variant = Variant(
                id=ID("dict-variant"),
                name=str(relative_json_path),
                impl=dict_impl.id,
                nonPresetImpls=compute_initial_nonPresetImpls(dict_impl),
            )
            section = Core(
                id=section_id,
                name="Data",
                variants=[variant.id],
                defaultVariant=variant.id,
            )
            project_config = ProjectConfig(
                id=project_config_id,
                name="Share Project",
                sectionVariantMap={section_id: variant.id},
                topLevelSections={section_id: TopLevelSectionLayout()},
            )
            project_state = ProjectStateSingleConfig(
                projectConfig=project_config,
                sections={section_id: section},
                sectionImpls={dict_impl.id: dict_impl},
                sectionVariants={variant.id: variant},
            )
            dbe = _write_project_with_state(root, project_state)
            frontend_sender = WMHFrontendSender(
                WebsocketManager(), share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            manager.initialize_share_state(settings_file)

            manager.create_session_backend("session-a")
            session_state = manager.get_session_state(
                "session-a", project_state.projectConfig.id
            )
            impl = get_curr_effective_section_impl_with_type_guard(
                session_state,
                section_id,
                DictSectionImpl,
            )
            assert not impl.jsonSourceMissing
            target_code_obj_id = None
            for code_obj_id in impl.codeObjVariantMap.keys():
                if session_state.codeObjs[code_obj_id].name == "foo":
                    target_code_obj_id = code_obj_id
                    break
            assert target_code_obj_id is not None
            code_impl = get_curr_effective_code_obj_impl_with_type_guard(
                session_state,
                section_id,
                target_code_obj_id,
                CodeParamCodeObjImpl,
            )
            assert "123" == code_impl.value

    def test_run_snapshot_mode_never_is_rejected(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = _build_share_deployment_root(tmpdir, "Share Project")
            project_config_id = ID("share-run-project")
            section_id = ID("code-section")
            binding_path = Path("code") / "runner.py"
            project_state = _build_code_project_state(
                project_config_id, section_id, binding_path
            )
            dbe = _write_project_with_state(root, project_state)
            dbe.write_json(
                root / "policy.json",
                SharePolicy(runSnapshotMode=RunSnapshotMode.never).model_dump(),
            )
            frontend_sender = WMHFrontendSender(WebsocketManager(), share_mode=True)
            with pytest.raises(ValueError):
                ShareRuntimeState(dbe, root, frontend_sender)

    def test_session_state_isolation(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = ProjectConfig(name="alpha")
            root = _build_share_deployment_root(tmpdir, config.name)
            dbe = _write_project(root, [config], config.id)
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())
            manager = ShareRuntimeState(
                dbe, root, WMHFrontendSender(WebsocketManager())
            )

            manager.create_session_backend("session-a")
            manager.create_session_backend("session-b")
            session_a = manager.get_session_state("session-a", config.id)
            session_b = manager.get_session_state("session-b", config.id)
            original_name = session_b.projectConfig.name

            session_a.projectConfig.name = "changed"
            manager.update_session_state("session-a", config.id, session_a)

            session_b_after = manager.get_session_state("session-b", config.id)
            session_a_after = manager.get_session_state("session-a", config.id)
            assert original_name == session_b_after.projectConfig.name
            assert (
                session_a_after.projectConfig.name
                != session_b_after.projectConfig.name
            )

    def test_update_session_state_targets_single_config(self) -> None:
        with TemporaryDirectory() as tmpdir:
            state_a = _build_project_state(
                ID("share-project-a"),
                ID("section-a"),
                project_config_name="Share Project A",
            )
            state_b = _build_project_state(
                ID("share-project-b"),
                ID("section-b"),
                project_config_name="Share Project B",
            )
            root = _build_share_deployment_root(tmpdir, state_a.projectConfig.name)
            dbe = _write_project_with_states(
                root,
                [state_a, state_b],
                default_project_config_id=state_a.projectConfig.id,
            )
            manager = ShareRuntimeState(
                dbe, root, WMHFrontendSender(WebsocketManager())
            )

            manager.create_session_backend("session-a")
            state_a_session = manager.get_session_state(
                "session-a", state_a.projectConfig.id
            )
            state_b_session = manager.get_session_state(
                "session-a", state_b.projectConfig.id
            )
            original_b_name = state_b_session.projectConfig.name

            state_a_session.projectConfig.name = "Updated Project A"
            manager.update_session_state(
                "session-a", state_a.projectConfig.id, state_a_session
            )

            updated_a = manager.get_session_state(
                "session-a", state_a.projectConfig.id
            )
            updated_b = manager.get_session_state(
                "session-a", state_b.projectConfig.id
            )
            assert "Updated Project A" == updated_a.projectConfig.name
            assert original_b_name == updated_b.projectConfig.name

    def test_unknown_session_state_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config = ProjectConfig(name="alpha")
            root = _build_share_deployment_root(tmpdir, config.name)
            dbe = _write_project(root, [config], config.id)
            deployment_name = root.parent.name
            manifest = DeploymentManifest(
                version=1,
                deploymentName=deployment_name,
                deploymentType=DeploymentType.share,
                defaultProjectConfigId=config.id,
                deploymentVersion=root.name,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())
            manager = ShareRuntimeState(
                dbe, root, WMHFrontendSender(WebsocketManager())
            )
            manager.create_session_backend("session-a")
            existing_state = manager.get_session_state("session-a", config.id)

            with pytest.raises(KeyError):
                manager.get_session_state("missing", config.id)
            with pytest.raises(KeyError):
                manager.update_session_state("missing", config.id, existing_state)
            with pytest.raises(KeyError):
                manager.delete_session_state("missing")
            with pytest.raises(KeyError):
                manager.create_session_backend("session-a")

    def test_listener_emit_requires_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            root = _build_share_deployment_root(tmpdir, state.projectConfig.name)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            manager.initialize_share_state(settings_file)
            python_sender = WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=manager,
                settings_file=settings_file,
                python_script_sender=python_sender,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )

            async def run_test() -> None:
                session_manager = switcher.get_for_session("session-a")
                try:
                    await session_manager._process_queue_task_started.wait()
                    with pytest.raises(ValueError):
                        await session_manager.apply_listener_emit_updates(
                            projectConfigId=project_config_id,
                            dependency_updates=[],
                            artifact_updates=[],
                        )
                finally:
                    session_manager.queue_task.cancel()
                    results = await asyncio.gather(
                        session_manager.queue_task,
                        return_exceptions=True,
                    )
                    assert 1 == len(results)
                    assert isinstance(results[0], asyncio.CancelledError)

            self._loop.run_until_complete(run_test())

    def test_listener_emit_requires_active_sessions(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            root = _build_share_deployment_root(tmpdir, state.projectConfig.name)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            manager.initialize_share_state(settings_file)
            python_sender = WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=manager,
                settings_file=settings_file,
                python_script_sender=python_sender,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )

            dependency_updates = [
                ListenerFrontendEmitKeyAndValue(
                    dependencyKey=create_dep_key(sectionId=section_id),
                    value=LiteralDependencyValue("Updated"),
                )
            ]

            async def run_test() -> None:
                session_manager = switcher.get_for_session("session-a")
                try:
                    await session_manager._process_queue_task_started.wait()
                    manager.delete_session_state("session-a")
                    with pytest.raises(KeyError):
                        await session_manager.apply_listener_emit_updates(
                            projectConfigId=project_config_id,
                            dependency_updates=dependency_updates,
                            artifact_updates=[],
                        )
                finally:
                    session_manager.queue_task.cancel()
                    results = await asyncio.gather(
                        session_manager.queue_task,
                        return_exceptions=True,
                    )
                    assert 1 == len(results)
                    assert isinstance(results[0], asyncio.CancelledError)

            self._loop.run_until_complete(run_test())

    def test_listener_emit_broadcasts_dependency_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            root = _build_share_deployment_root(tmpdir, state.projectConfig.name)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            manager.initialize_share_state(settings_file)
            python_sender = WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=manager,
                settings_file=settings_file,
                python_script_sender=python_sender,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )

            manager.create_session_backend("session-a")
            manager.create_session_backend("session-b")

            frontend_messages_a: list[Message] = []
            frontend_messages_b: list[Message] = []
            websocket_a = self._loop.run_until_complete(
                _build_websocket(frontend_messages_a)
            )
            websocket_b = self._loop.run_until_complete(
                _build_websocket(frontend_messages_b)
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_a,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-a",
                    shareSessionId="session-a",
                )
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_b,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-b",
                    shareSessionId="session-b",
                )
            )

            new_text = "Updated text"
            dependency_updates = [
                ListenerFrontendEmitKeyAndValue(
                    dependencyKey=create_dep_key(sectionId=section_id),
                    value=LiteralDependencyValue(new_text),
                )
            ]

            async def run_test() -> None:
                session_manager = switcher.get_for_session("session-a")
                try:
                    await session_manager._process_queue_task_started.wait()
                    await session_manager.apply_listener_emit_updates(
                        projectConfigId=project_config_id,
                        dependency_updates=dependency_updates,
                        artifact_updates=[],
                    )
                finally:
                    session_manager.queue_task.cancel()
                    results = await asyncio.gather(
                        session_manager.queue_task,
                        return_exceptions=True,
                    )
                    assert 1 == len(results)
                    assert isinstance(results[0], asyncio.CancelledError)

            self._loop.run_until_complete(run_test())

            session_state_a = manager.get_session_state("session-a", project_config_id)
            impl_a = get_curr_effective_section_impl_with_type_guard(
                session_state_a,
                section_id,
                TextBlockSectionImpl,
            )
            assert new_text == impl_a.text

            session_state_b = manager.get_session_state("session-b", project_config_id)
            impl_b = get_curr_effective_section_impl_with_type_guard(
                session_state_b,
                section_id,
                TextBlockSectionImpl,
            )
            assert new_text != impl_b.text

            types_a = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_a)
            ]
            types_b = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_b)
            ]

            assert "UpdateFrontendProjectState" in types_a
            assert "UpdateFrontendProjectState" not in types_b

            self._loop.run_until_complete(websocket_a.close())
            self._loop.run_until_complete(websocket_b.close())

    def test_listener_emit_updates_registered_session_manager(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            root = _build_share_deployment_root(tmpdir, state.projectConfig.name)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)

            async def run_test() -> None:
                python_sender = WMHPythonScriptSender(
                    websocket_manager,
                    ListenerRegistry(),
                )
                settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
                manager.initialize_share_state(settings_file)
                switcher = ProjectManagerSwitcher(
                    share_runtime_state=manager,
                    settings_file=settings_file,
                    python_script_sender=python_sender,
                    lsp_writers=None,
                    frontend_sender=frontend_sender,
                    specific_file_watcher=SpecificFileWatcher(),
                )
                session_manager = switcher.get_for_session("session-a")
                try:
                    await session_manager._process_queue_task_started.wait()
                    new_text = "Updated text"
                    dependency_updates = [
                        ListenerFrontendEmitKeyAndValue(
                            dependencyKey=create_dep_key(sectionId=section_id),
                            value=LiteralDependencyValue(new_text),
                        )
                    ]
                    await session_manager.apply_listener_emit_updates(
                        projectConfigId=project_config_id,
                        dependency_updates=dependency_updates,
                        artifact_updates=[],
                    )

                    session_state = session_manager.get_single_config_state(
                        project_config_id
                    )
                    impl = get_curr_effective_section_impl_with_type_guard(
                        session_state,
                        section_id,
                        TextBlockSectionImpl,
                    )
                    assert new_text == impl.text
                finally:
                    session_manager.queue_task.cancel()
                    results = await asyncio.gather(
                        session_manager.queue_task,
                        return_exceptions=True,
                    )
                    assert 1 == len(results)
                    assert isinstance(results[0], asyncio.CancelledError)

            self._loop.run_until_complete(run_test())

    def test_listener_emit_broadcasts_artifact_updates(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_id = ID("listener-project")
            section_id = ID("section-a")
            state = _build_project_state(project_config_id, section_id)
            root = _build_share_deployment_root(tmpdir, state.projectConfig.name)
            dbe = _write_project_with_state(root, state)
            websocket_manager = WebsocketManager()
            frontend_sender = WMHFrontendSender(
                websocket_manager, share_mode=True
            )
            manager = ShareRuntimeState(dbe, root, frontend_sender)
            settings_file = SettingsFile(dbe, frontend_sender, allow_write=False)
            manager.initialize_share_state(settings_file)
            python_sender = WMHPythonScriptSender(
                websocket_manager,
                ListenerRegistry(),
            )
            switcher = ProjectManagerSwitcher(
                share_runtime_state=manager,
                settings_file=settings_file,
                python_script_sender=python_sender,
                lsp_writers=None,
                frontend_sender=frontend_sender,
                specific_file_watcher=SpecificFileWatcher(),
            )

            manager.create_session_backend("session-a")
            manager.create_session_backend("session-b")

            frontend_messages_a: list[Message] = []
            frontend_messages_b: list[Message] = []
            websocket_a = self._loop.run_until_complete(
                _build_websocket(frontend_messages_a)
            )
            websocket_b = self._loop.run_until_complete(
                _build_websocket(frontend_messages_b)
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_a,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-a",
                    shareSessionId="session-a",
                )
            )
            self._loop.run_until_complete(
                websocket_manager.on_connect(
                    websocket_b,
                    WebsocketConnectionType.FRONTEND,
                    id="frontend-b",
                    shareSessionId="session-b",
                )
            )

            artifact_updates = [
                ImageArtifact(
                    id="artifacts/share-image.png",
                    value=BinaryContentRef(
                        contentId="share-image",
                        byteLength=3,
                        mimeType="image/png",
                    ),
                )
            ]

            async def run_test() -> None:
                session_manager = switcher.get_for_session("session-b")
                try:
                    await session_manager._process_queue_task_started.wait()
                    await session_manager.apply_listener_emit_updates(
                        projectConfigId=project_config_id,
                        dependency_updates=[],
                        artifact_updates=artifact_updates,
                    )
                finally:
                    session_manager.queue_task.cancel()
                    results = await asyncio.gather(
                        session_manager.queue_task,
                        return_exceptions=True,
                    )
                    assert 1 == len(results)
                    assert isinstance(results[0], asyncio.CancelledError)

            self._loop.run_until_complete(run_test())

            types_a = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_a)
            ]
            types_b = [
                json.loads(text)["messageType"]
                for text in _sent_text_messages(frontend_messages_b)
            ]

            assert "UpdateArtifacts" not in types_a
            assert "UpdateArtifacts" in types_b

            self._loop.run_until_complete(websocket_a.close())
            self._loop.run_until_complete(websocket_b.close())
