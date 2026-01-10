from pathlib import Path
from typing import TYPE_CHECKING

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.utils import sanitize_name
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.codegen_helpers import (
    build_python_code_generator,
)
from setta.project_state.jsonSource.jsonSource import JSONSource, ProcessedJSONInfo
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.project_manager_types import RunCodeRequest
from setta.project_state.run_commands import (
    build_bash_run_command,
    build_python_file_run_command,
)
from setta.project_state.run_snapshot import (
    SnapshotSectionInput,
    create_snapshot_run_command_from_sections,
)
from setta.runtime.scoped_sender import ScopedFrontendSender
from setta.share.deployment_utils import rewrite_project_state_paths
from setta.share.policy import (
    load_share_policy_from_dbe,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import (
    BaseDictSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionImpl,
    GenPythonCodeSectionImpl,
)
from setta.types.settings_state import RunSnapshotMode
from setta.utils.utils import normalize_path

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
        self.project_state_backend = self.load_initial_state()
        self.manifest = self.dbe.read_share_manifest()
        self.project_config_name = self._resolve_project_config_name()
        self.deployment_version = self._resolve_deployment_version()
        self._validate_deployment_root()
        self.default_project_config_id = self._resolve_default_project_config_id()
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

    def load_initial_state(self) -> ProjectStateBackend:
        project_state = self.dbe.read_project_required()
        self._rebase_deployment_paths(project_state)
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
        scoped_sender = ScopedFrontendSender(self.frontend_sender, session_id)
        artifacts = Artifacts(scoped_sender, self._artifact_watcher, self.dbe)
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
        gen_binding = self._get_gen_code_binding(project_state)
        code_sections = self._collect_code_sections(project_state)

        if not section_id:
            section_id = project_state.projectConfig.entryCodeBlockId

        # Share mode always snapshots; runSnapshotMode only controls cleanup scheduling.
        gen_code = self._generate_gen_code(project_state)
        snapshot_section_inputs: dict[ID, SnapshotSectionInput] = {}
        for sid, (code, binding, language) in code_sections.items():

            def run_command_builder(path: Path, language=language) -> str:
                if language == CodeLanguage.python:
                    return build_python_file_run_command(path)
                return build_bash_run_command(path, use_absolute=True, quote=True)

            snapshot_section_inputs[sid] = (code, binding, run_command_builder)

        return create_snapshot_run_command_from_sections(
            dbe=self.dbe,
            snapshot_root=self.share_runs_root / resolved_session_id,
            entry_section_id=section_id,
            gen_code=gen_code,
            gen_binding=gen_binding,
            section_inputs=snapshot_section_inputs,
            gen_command_builder=build_python_file_run_command,
        )

    def _resolve_default_project_config_id(self) -> ID:
        project_config_id = self.manifest.projectConfigId
        if project_config_id not in self.project_state_backend.projectConfigs:
            raise KeyError(
                "Share deployment manifest references missing project config: "
                f"{project_config_id}"
            )
        return project_config_id

    def _resolve_project_config_name(self) -> str:
        project_config_name = self.manifest.projectConfigName
        if not project_config_name:
            raise ValueError("Share deployment manifest missing projectConfigName")
        return project_config_name

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
        project_slug = sanitize_name(project_state.projectConfig.name)
        deployment_path = (
            self.deployment_root / "code" / "sections" / project_slug / "setta_gen.py"
        ).resolve()
        if deployment_path.exists():
            return CodeFileBinding(
                canonical_path=deployment_path,
                access_mode=CodeFileAccessMode.write_only,
            )
        runtime_path = (
            self.dbe.runtime_root / "code" / "sections" / project_slug / "setta_gen.py"
        ).resolve()
        return CodeFileBinding(
            canonical_path=runtime_path,
            access_mode=CodeFileAccessMode.write_only,
        )

    def _hydrate_json_sources(
        self,
        project_state: ProjectStateBackend,
        settings_file: "SettingsFile",
    ) -> None:
        section_variant_ids: list[tuple[ID, ID]] = []
        json_source_paths: set[Path] = set()
        for section in project_state.sections.values():
            for variant_id in section.variants:
                variant, _, impl = get_variant_base_and_effective_section_impl(
                    project_state, section, variant_id
                )
                if not isinstance(impl, BaseDictSectionImpl) or not impl.isJsonSource:
                    continue
                section_variant_ids.append((section.id, variant_id))
                json_source_paths.add(normalize_path(variant.name))

        if not section_variant_ids:
            return

        json_source = JSONSource(
            self.frontend_sender,
            settings_file,
            SpecificFileWatcher(),
            self.dbe,
        )
        json_sources: dict[Path, ProcessedJSONInfo] = {}
        for path in json_source_paths:
            if not path.exists():
                continue
            payload = self.dbe.read_json(path)
            json_sources[path] = json_source.process_json_object(payload)

        load_json_sources_into_data_structures(
            project_state,
            json_sources,
            section_variant_ids,
        )

    def _resolve_deployment_path(self, path_str: str) -> str:
        if not path_str:
            return path_str
        path = Path(path_str)
        if path.is_absolute():
            return str(path.resolve())
        resolved = (self.deployment_root / path).resolve()
        return str(resolved)

    def _resolve_code_binding(self, binding: CodeFileBinding) -> CodeFileBinding:
        path = binding.canonical_path
        if path.is_absolute():
            return CodeFileBinding(
                canonical_path=path.resolve(),
                access_mode=binding.access_mode,
            )
        resolved = (self.deployment_root / path).resolve()
        return CodeFileBinding(
            canonical_path=resolved,
            access_mode=binding.access_mode,
        )

    def _rebase_deployment_paths(self, project_state: ProjectStateBackend) -> None:
        rewrite_project_state_paths(
            project_state,
            resolve_artifact_path=self._resolve_deployment_path,
            resolve_code_binding=self._resolve_code_binding,
            resolve_json_source_name=self._resolve_deployment_path,
        )

    def _get_gen_code_binding(
        self, project_state: "ProjectStateSingleConfig"
    ) -> "CodeFileBinding":
        gen_binding = project_state.genCodeBinding
        if gen_binding is None:
            raise KeyError("Share run missing generated code binding")
        return gen_binding

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
            output[section_id] = (
                section_impl.code,
                section_impl.codeFileBinding,
                section_impl.codeLanguage,
            )
        return output

    def _generate_gen_code(self, project_state: "ProjectStateSingleConfig") -> str:
        dep_graph = DependencyGraph(project_state)
        code_generator = build_python_code_generator(project_state, dep_graph)
        code_generator.generate_code()
        return code_generator.code
