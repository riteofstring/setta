from pathlib import Path
from typing import TYPE_CHECKING, Union

from setta.code_gen.dependency_graph import DependencyGraph
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.code import (
    SnapshotSectionInput,
    build_bash_run_command,
    build_python_snapshot_module_run_command,
    create_snapshot_run_command_from_code_sections_only,
    create_snapshot_run_command_from_sections,
)
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.project_code import build_python_code_generator
from setta.project_state.project_manager_types import RunCodeRequest
from setta.share.deployment_utils import rewrite_project_state_paths
from setta.share.policy import (
    load_share_policy_from_dbe,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    project_config_has_codegen_language,
)
from setta.types.project_state import RUNNABLE_CODE_LANGUAGES, ProjectStateBackend
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
)
from setta.types.settings_state import RunSnapshotMode
from setta.utils.utils import build_gen_code_path

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.types.share_deployment import SharePolicy
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ShareRuntimeState:
    def __init__(
        self,
        dbe: DBE,
        deployment_root: Path,
        frontend_sender: "WMHFrontendSender",
        specific_file_watcher: SpecificFileWatcher | None = None,
    ) -> None:
        self.dbe = dbe
        self.deployment_root = deployment_root
        self.frontend_sender = frontend_sender
        self._validate_deployment_root()
        self._deployment_root_resolved = self.deployment_root.resolve()
        self.project_state_backend = self.load_initial_state()
        self.manifest = self.dbe.read_share_manifest()
        self.deployment_name = self._resolve_deployment_name()
        self.deployment_version = self._resolve_deployment_version()
        self.default_project_config_id = self._resolve_default_project_config_id()
        self.default_project_config_name = self._resolve_default_project_config_name()
        self.project_state_backend.defaultProjectConfigId = (
            self.default_project_config_id
        )
        self.share_policy: "SharePolicy" = load_share_policy_from_dbe(self.dbe)
        if self.share_policy.runSnapshotMode == RunSnapshotMode.never:
            raise ValueError(
                "Share deployments do not support runSnapshotMode=never. "
                "Use ephemeral or always."
            )
        self._session_backends: dict[str, ProjectStateBackend] = {}
        self._session_artifacts: dict[str, Artifacts] = {}
        self._artifact_watcher = specific_file_watcher or SpecificFileWatcher()
        self._base_backend: ProjectStateBackend | None = None

    @property
    def share_runs_root(self) -> Path:
        return self.dbe.runtime_root / "share_runs"

    def should_refresh_codegen(self) -> bool:
        listener_enabled = bool(
            self.manifest.listener and self.manifest.listener.enabled
        )
        return (
            self.share_policy.allowParamChanges
            or self.share_policy.allowRun
            or listener_enabled
        )

    def load_initial_state(self) -> ProjectStateBackend:
        project_state = self.dbe.read_project_required()
        self._rebase_deployment_paths(project_state)
        for project_config_id in project_state.projectConfigs.keys():
            single_config = convert_backend_to_single_config(
                project_state, project_config_id
            )
            self._require_code_section_bindings(single_config)
        return project_state

    def create_session_backend(self, session_id: str) -> ProjectStateBackend:
        if session_id in self._session_backends:
            raise KeyError(f"Share session already exists: {session_id}")
        project_state = self._build_base_backend()
        self._session_backends[session_id] = project_state
        return project_state

    def get_session_backend(self, session_id: str) -> ProjectStateBackend:
        if session_id not in self._session_backends:
            raise KeyError(f"Unknown share session backend: {session_id}")
        return self._session_backends[session_id]

    def get_or_create_session_backend(self, session_id: str) -> ProjectStateBackend:
        if session_id in self._session_backends:
            return self._session_backends[session_id]
        return self.create_session_backend(session_id)

    def require_session_id(self, session_id: str | None) -> str:
        if session_id is None:
            raise KeyError("Missing share session id")
        return session_id

    def require_session_state(
        self,
        session_id: str | None,
        project_config_id: ID,
    ) -> tuple[str, "ProjectStateSingleConfig"]:
        resolved_session_id = self.require_session_id(session_id)
        return resolved_session_id, self.get_session_state(
            resolved_session_id, project_config_id
        )

    def get_session_state(
        self, session_id: str, project_config_id: ID
    ) -> "ProjectStateSingleConfig":
        backend = self.get_session_backend(session_id)
        if project_config_id not in backend.projectConfigs:
            raise KeyError(f"Unknown share project config: {project_config_id}")
        project_state = convert_backend_to_single_config(
            backend, project_config_id
        ).model_copy(deep=True)
        updated_binding = self._ensure_gen_code_binding(project_state)
        project_state.validate_for_update(validate_code_file_bindings=False)
        if updated_binding:
            self._session_backends[session_id] = merge_single_config_into_backend(
                backend,
                project_state,
            )
        return project_state

    def get_session_state_for_client(
        self, session_id: str, project_config_id: ID
    ) -> "ProjectStateSingleConfig":
        project_state = self.get_session_state(session_id, project_config_id)
        return self.format_project_state_for_client(project_state)

    def update_session_state(
        self,
        session_id: str,
        project_config_id: ID,
        project_state: "ProjectStateSingleConfig",
    ) -> ProjectStateBackend:
        if session_id not in self._session_backends:
            raise KeyError(f"Unknown share session backend: {session_id}")
        if project_config_id not in self._session_backends[session_id].projectConfigs:
            raise KeyError(f"Unknown share project config: {project_config_id}")
        updated = merge_single_config_into_backend(
            self._session_backends[session_id], project_state
        )
        self._session_backends[session_id] = updated
        return updated

    def delete_session_state(self, session_id: str) -> None:
        if session_id not in self._session_backends:
            raise KeyError(f"Unknown share session backend: {session_id}")
        del self._session_backends[session_id]
        if session_id in self._session_artifacts:
            del self._session_artifacts[session_id]

    def get_session_artifacts(self, session_id: str) -> Artifacts:
        if session_id in self._session_artifacts:
            return self._session_artifacts[session_id]
        scoped_sender = self.frontend_sender.scoped(session_id)
        artifacts = Artifacts(
            scoped_sender,
            self._artifact_watcher,
            self.dbe,
            artifact_id_resolver=self._format_share_artifact_id,
            path_resolver=self._resolve_share_artifact_path,
        )
        self._session_artifacts[session_id] = artifacts
        return artifacts

    def has_session_state(self, session_id: str) -> bool:
        return session_id in self._session_backends

    async def create_run_command(
        self,
        share_session_id: str | None,
        x: RunCodeRequest,
    ) -> str:
        project_config_id = x.projectConfigId
        section_id = x.sectionId
        resolved_session_id, project_state = self.require_session_state(
            share_session_id,
            project_config_id,
        )
        snapshot_root = self.share_runs_root / resolved_session_id
        python_codegen_enabled = project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        )
        code_sections = self._collect_code_sections(project_state)

        if not section_id:
            section_id = project_state.projectConfig.entryCodeBlockId

        # Share mode always snapshots; runSnapshotMode only controls cleanup scheduling.
        snapshot_section_inputs: dict[ID, SnapshotSectionInput] = {}
        for sid, (code, binding, language) in code_sections.items():

            def run_command_builder(
                path: Path, language=language, snapshot_root=snapshot_root
            ) -> str:
                if language == CodeLanguage.python:
                    return build_python_snapshot_module_run_command(snapshot_root, path)
                if language == CodeLanguage.bash:
                    return build_bash_run_command(path, use_absolute=True, quote=True)
                raise ValueError(f"Unsupported code language for run: {language}")

            snapshot_section_inputs[sid] = (code, binding, run_command_builder)

        if not python_codegen_enabled:
            return create_snapshot_run_command_from_code_sections_only(
                dbe=self.dbe,
                snapshot_root=snapshot_root,
                entry_section_id=section_id,
                section_inputs=snapshot_section_inputs,
            )

        gen_binding = self._get_gen_code_binding(project_state)
        gen_code, gen_meta_code = self._generate_gen_code(project_state)

        def gen_command_builder(path: Path, snapshot_root=snapshot_root) -> str:
            return build_python_snapshot_module_run_command(snapshot_root, path)

        return create_snapshot_run_command_from_sections(
            dbe=self.dbe,
            snapshot_root=snapshot_root,
            entry_section_id=section_id,
            gen_code=gen_code,
            gen_meta_code=gen_meta_code,
            gen_binding=gen_binding,
            section_inputs=snapshot_section_inputs,
            gen_command_builder=gen_command_builder,
        )

    def _resolve_default_project_config_id(self) -> ID:
        project_config_id = self.manifest.defaultProjectConfigId
        if project_config_id not in self.project_state_backend.projectConfigs:
            raise KeyError(
                "Share deployment manifest references missing project config: "
                f"{project_config_id}"
            )
        return project_config_id

    def _resolve_default_project_config_name(self) -> str:
        project_config_id = self.default_project_config_id
        project_configs = self.project_state_backend.projectConfigs
        if project_config_id not in project_configs:
            raise KeyError(
                "Share deployment manifest references missing project config: "
                f"{project_config_id}"
            )
        return project_configs[project_config_id].name

    def _resolve_deployment_name(self) -> str:
        deployment_name = self.manifest.deploymentName
        if not deployment_name:
            raise ValueError("Share deployment manifest missing deploymentName")
        return deployment_name

    def _resolve_deployment_version(self) -> str:
        deployment_version = self.manifest.deploymentVersion
        if not deployment_version:
            raise ValueError("Share deployment manifest missing deploymentVersion")
        return deployment_version

    def _validate_deployment_root(self) -> None:
        if not self.deployment_root.exists():
            raise FileNotFoundError(
                f"Share deployment root does not exist: {self.deployment_root}"
            )
        if not self.deployment_root.is_dir():
            raise NotADirectoryError(
                f"Share deployment root is not a directory: {self.deployment_root}"
            )

    def _build_base_backend(self) -> ProjectStateBackend:
        if self._base_backend is not None:
            return self._base_backend.model_copy(deep=True)
        return self.project_state_backend.model_copy(deep=True)

    def initialize_share_state(self, settings_file: "SettingsFile") -> None:
        base_backend = self.project_state_backend.model_copy(deep=True)
        self._hydrate_json_sources(base_backend, settings_file)
        self._base_backend = base_backend

    def _ensure_gen_code_binding(
        self,
        project_state: "ProjectStateSingleConfig",
    ) -> bool:
        if not project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        ):
            project_state.genCodeBinding = None
            return False
        if project_state.genCodeBinding is not None:
            return False
        gen_section_id = project_state.singletonSections.GenPythonCode
        if gen_section_id is None:
            project_state.genCodeBinding = self._build_fallback_gen_code_binding(
                project_state
            )
            return True
        gen_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            gen_section_id,
            GenPythonCodeSectionImpl,
        )
        if gen_impl.codeFileBinding is None:
            project_state.genCodeBinding = self._build_fallback_gen_code_binding(
                project_state
            )
            return True
        project_state.genCodeBinding = gen_impl.codeFileBinding
        return True

    def _build_fallback_gen_code_binding(
        self,
        project_state: "ProjectStateSingleConfig",
    ) -> CodeFileBinding:
        deployment_path = build_gen_code_path(
            self.deployment_root / "code",
            project_state.projectConfig.name,
        )
        return CodeFileBinding(
            canonical_path=self._resolve_deployment_path_to_absolute(deployment_path),
            access_mode=CodeFileAccessMode.read_only,
        )

    def _hydrate_json_sources(
        self,
        project_state: ProjectStateBackend,
        settings_file: "SettingsFile",
    ) -> None:
        json_source = JSONSource(
            self.frontend_sender,
            settings_file,
            SpecificFileWatcher(),
            self.dbe,
        )
        json_source_paths, json_source_to_section_variants = (
            json_source.get_json_source_files_to_watch(project_state)
        )
        section_variant_ids: set[tuple[ID, ID]] = set()
        for section_variant_set in json_source_to_section_variants.values():
            section_variant_ids.update(section_variant_set)

        if not section_variant_ids:
            return

        json_sources = json_source.process_json_source_files(json_source_paths)

        load_json_sources_into_data_structures(
            project_state,
            json_sources,
            section_variant_ids,
        )

    def _resolve_deployment_path_to_absolute(self, path: Path | str) -> Path:
        raw_path = Path(path)
        if raw_path.is_absolute():
            resolved = raw_path.resolve()
        else:
            resolved = (self.deployment_root / raw_path).resolve()
        if not resolved.is_relative_to(self._deployment_root_resolved):
            raise ValueError(
                f"Share deployment path escapes deployment root: {raw_path.as_posix()}"
            )
        return resolved

    def _resolve_deployment_path(self, path_str: str) -> str:
        if not path_str:
            return path_str
        resolved = self._resolve_deployment_path_to_absolute(path_str)
        return str(resolved)

    def _resolve_share_artifact_path(self, path: Path | str) -> Path:
        return self._resolve_deployment_path_to_absolute(path)

    def _format_share_artifact_id(self, path: Path | str) -> str:
        resolved = self._resolve_deployment_path_to_absolute(path)
        return resolved.relative_to(self._deployment_root_resolved).as_posix()

    def _resolve_code_binding(self, binding: CodeFileBinding) -> CodeFileBinding:
        resolved = self._resolve_deployment_path_to_absolute(binding.canonical_path)
        return CodeFileBinding(
            canonical_path=resolved,
            access_mode=CodeFileAccessMode.read_only,
        )

    def _rebase_deployment_paths(
        self,
        project_state: Union[ProjectStateBackend, "ProjectStateSingleConfig"],
    ) -> None:
        rewrite_project_state_paths(
            project_state,
            resolve_artifact_path=self._resolve_deployment_path,
            resolve_code_binding=self._resolve_code_binding,
            resolve_json_source_name=self._resolve_deployment_path,
        )

    def normalize_project_state_paths(
        self,
        project_state: "ProjectStateSingleConfig",
    ) -> None:
        self._ensure_gen_code_binding(project_state)
        self._rebase_deployment_paths(project_state)

    def _format_deployment_relative_path(self, path_str: str) -> str:
        if not path_str:
            return path_str
        resolved = self._resolve_deployment_path_to_absolute(path_str)
        return resolved.relative_to(self._deployment_root_resolved).as_posix()

    def _format_code_binding_relative(
        self, binding: CodeFileBinding
    ) -> CodeFileBinding:
        relative_path = self._format_deployment_relative_path(
            str(binding.canonical_path)
        )
        return CodeFileBinding(
            canonical_path=Path(relative_path),
            access_mode=binding.access_mode,
        )

    def format_project_state_for_client(
        self,
        project_state: "ProjectStateSingleConfig",
    ) -> "ProjectStateSingleConfig":
        redacted = project_state.model_copy(deep=True)
        rewrite_project_state_paths(
            redacted,
            resolve_artifact_path=self._format_deployment_relative_path,
            resolve_code_binding=self._format_code_binding_relative,
            resolve_json_source_name=self._format_deployment_relative_path,
        )
        return redacted

    def _get_gen_code_binding(
        self, project_state: "ProjectStateSingleConfig"
    ) -> "CodeFileBinding":
        if not project_config_has_codegen_language(
            project_state.projectConfig,
            ProjectCodegenLanguage.python,
        ):
            raise KeyError("Python codegen disabled for share run.")
        gen_binding = project_state.genCodeBinding
        if gen_binding is None:
            raise KeyError("Share run missing generated code binding")
        return gen_binding

    def _require_code_section_bindings(
        self, project_state: "ProjectStateSingleConfig"
    ) -> None:
        for section_id in project_state.sections.keys():
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CodeSectionImpl):
                continue
            if section_impl.codeFileBinding is None:
                raise KeyError(f"Missing code binding for section {section_id}")

    def _collect_code_sections(
        self, project_state: "ProjectStateSingleConfig"
    ) -> dict[ID, tuple[str, "CodeFileBinding", CodeLanguage]]:
        output: dict[ID, tuple[str, "CodeFileBinding", CodeLanguage]] = {}
        for section_id in project_state.sections.keys():
            section_impl = get_curr_effective_section_impl(project_state, section_id)
            if not isinstance(section_impl, CodeSectionImpl):
                continue
            if section_impl.codeFileBinding is None:
                raise KeyError(f"Missing code binding for section {section_id}")
            if section_impl.codeLanguage not in RUNNABLE_CODE_LANGUAGES:
                continue
            output[section_id] = (
                section_impl.code,
                section_impl.codeFileBinding,
                section_impl.codeLanguage,
            )
        return output

    def _generate_gen_code(
        self, project_state: "ProjectStateSingleConfig"
    ) -> tuple[str, str | None]:
        dep_graph = DependencyGraph(project_state)
        code_generator = build_python_code_generator(project_state, dep_graph)
        code_generator.generate_code()
        return code_generator.code, code_generator.meta_code
