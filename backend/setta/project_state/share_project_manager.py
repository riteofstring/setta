import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import PythonCodeGenerator
from setta.code_gen.utils import sanitize_name
from setta.code_gen.value_mode import PythonValueMode
from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource.jsonSource import JSONSource, ProcessedJSONInfo
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.listener_artifact_updates import (
    apply_listener_artifact_updates,
)
from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.project_state.utils import (
    create_timestamped_folder,
)
from setta.share.deployment_utils import rewrite_project_state_paths
from setta.share.policy import (
    ensure_share_artifact_paths_scoped,
    ensure_share_listener_emits_allowed,
    load_share_policy_from_dbe,
    resolve_section_ids_for_artifacts,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    get_curr_effective_section_impl_with_type_guard,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
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
from setta.types.share_deployment import ShareDeploymentManifest
from setta.utils.utils import normalize_path

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.project_state.share_session_project_manager import (
        ShareSessionProjectManager,
    )
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.types.share_deployment import SharePolicy
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class ShareProjectManager:
    def __init__(
        self,
        dbe: DBE,
        deployment_root: Path,
        frontend_sender: "WMHFrontendSender",
    ) -> None:
        self.dbe = dbe
        self.deployment_root = deployment_root
        self.frontend_sender = frontend_sender
        self.project_state_backend = self.load_initial_state()
        self.manifest = self._load_manifest()
        self.project_config_name = self._resolve_project_config_name()
        self.deployment_version = self._resolve_deployment_version()
        self._validate_deployment_root()
        self.project_config_id = self._resolve_project_config_id()
        self.share_policy: "SharePolicy" = load_share_policy_from_dbe(self.dbe)
        if self.share_policy.runSnapshotMode == RunSnapshotMode.never:
            raise ValueError(
                "Share deployments do not support runSnapshotMode=never. "
                "Use ephemeral or always."
            )
        self._session_states: dict[str, "ProjectStateSingleConfig"] = {}
        self._session_artifacts: dict[str, Artifacts] = {}
        self._session_managers: dict[str, "ShareSessionProjectManager"] = {}
        self._artifact_watcher = SpecificFileWatcher()
        self._base_state: "ProjectStateSingleConfig | None" = None

    @property
    def share_runs_root(self) -> Path:
        return self.dbe.runtime_root / "share_runs"

    def load_initial_state(self) -> ProjectStateBackend:
        project_state = self.dbe.read_project()
        self._rebase_deployment_paths(project_state)
        return project_state

    def create_session_state(self, session_id: str) -> "ProjectStateSingleConfig":
        if session_id in self._session_states:
            raise KeyError(f"Share session already exists: {session_id}")
        project_state = self._build_base_state()
        if self.share_policy.allowLSP:
            self._rebase_session_code_paths(project_state, session_id)
        self._session_states[session_id] = project_state
        return project_state

    def get_session_state(self, session_id: str) -> "ProjectStateSingleConfig":
        if session_id not in self._session_states:
            raise KeyError(f"Unknown share session state: {session_id}")
        return self._session_states[session_id]

    def get_or_create_session_state(
        self, session_id: str
    ) -> "ProjectStateSingleConfig":
        if session_id in self._session_states:
            return self._session_states[session_id]
        return self.create_session_state(session_id)

    def update_session_state(
        self, session_id: str, project_state: "ProjectStateSingleConfig"
    ) -> None:
        if session_id not in self._session_states:
            raise KeyError(f"Unknown share session state: {session_id}")
        self.update(project_state)
        self._session_states[session_id] = project_state

    def delete_session_state(self, session_id: str) -> None:
        if session_id not in self._session_states:
            raise KeyError(f"Unknown share session state: {session_id}")
        del self._session_states[session_id]
        if session_id in self._session_artifacts:
            del self._session_artifacts[session_id]
        if session_id in self._session_managers:
            del self._session_managers[session_id]
        if self.share_policy.allowLSP:
            session_root = self._resolve_session_code_root(session_id)
            if session_root.exists():
                shutil.rmtree(session_root)

    def get_session_artifacts(self, session_id: str) -> Artifacts:
        if session_id in self._session_artifacts:
            return self._session_artifacts[session_id]
        artifacts = Artifacts(self.frontend_sender, self._artifact_watcher, self.dbe)
        self._session_artifacts[session_id] = artifacts
        return artifacts

    def get_session_ids(self) -> list[str]:
        return list(self._session_states.keys())

    def has_session_state(self, session_id: str) -> bool:
        return session_id in self._session_states

    def register_session_manager(
        self, session_id: str, manager: "ShareSessionProjectManager"
    ) -> None:
        self._session_managers[session_id] = manager

    def save(self) -> None:
        return None

    def update(self, project_state: "ProjectStateSingleConfig") -> None:
        self._validate_project_state(project_state)

    def watch_json_source_files(self) -> None:
        return None

    def watch_artifact_files(self) -> None:
        return None

    def watch_code_files(self) -> None:
        return None

    async def create_run_command(
        self,
        share_session_id: str,
        section_id: ID | None,
    ) -> str:
        project_state = self.get_session_state(share_session_id)
        run_snapshot_mode = self._resolve_run_snapshot_mode()
        gen_binding = self._get_gen_code_binding(project_state)
        code_sections = self._collect_code_sections(project_state)

        if not section_id:
            section_id = project_state.projectConfig.entryCodeBlockId

        if run_snapshot_mode == RunSnapshotMode.never:
            gen_code_path = gen_binding.canonical_path
            code_paths = {
                sid: binding.canonical_path
                for sid, (_, binding, _) in code_sections.items()
            }
        else:
            gen_code = self._generate_gen_code(project_state)
            target_folder = self._create_share_run_folder(share_session_id)
            gen_code_path = self._write_snapshot_file(
                target_folder, gen_binding, gen_code
            )
            code_paths: dict[ID, Path] = {}
            for sid, (code, binding, _) in code_sections.items():
                code_paths[sid] = self._write_snapshot_file(
                    target_folder, binding, code
                )

        if section_id:
            if section_id not in code_sections:
                raise KeyError(f"Missing code section for run: {section_id}")
            _, _, language = code_sections[section_id]
            return self._build_run_command(language, code_paths[section_id])

        return self._build_python_run_command(gen_code_path)

    def _load_manifest(self) -> ShareDeploymentManifest:
        manifest_path = self.deployment_root / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"Share deployment manifest not found: {manifest_path}"
            )
        payload = self.dbe.read_json(manifest_path)
        if not payload:
            raise ValueError(f"Share deployment manifest is empty: {manifest_path}")
        return ShareDeploymentManifest.model_validate(payload)

    def _resolve_project_config_id(self) -> ID:
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
        project_path = self.deployment_root / "project.json"
        if not project_path.exists():
            raise FileNotFoundError(
                f"Share deployment missing project.json: {project_path}"
            )

    def _build_base_state(self) -> "ProjectStateSingleConfig":
        if self._base_state is not None:
            return self._base_state.model_copy(deep=True)
        base_state = (
            convert_backend_to_single_config(
                self.project_state_backend, self.project_config_id
            )
        ).model_copy(deep=True)
        self._ensure_gen_code_binding(base_state)
        self._validate_project_state(base_state)
        return base_state

    def build_base_state(self) -> "ProjectStateSingleConfig":
        return self._build_base_state()

    def initialize_share_state(self, settings_file: "SettingsFile") -> None:
        base_state = (
            convert_backend_to_single_config(
                self.project_state_backend, self.project_config_id
            )
        ).model_copy(deep=True)
        self._hydrate_json_sources(base_state, settings_file)
        self._ensure_gen_code_binding(base_state)
        self._validate_project_state(base_state)
        self._base_state = base_state

    def _validate_project_state(
        self, project_state: "ProjectStateSingleConfig"
    ) -> None:
        project_state.validate_singleton_sections()
        project_state.validate_parent_section_map()
        project_state.validate_view_modes()
        project_state.validate_shown_param_ids()
        project_state.validate_yaml_values()
        project_state.validate_required_decoded_images()

    def _ensure_gen_code_binding(
        self, project_state: "ProjectStateSingleConfig"
    ) -> None:
        if project_state.genCodeBinding is not None:
            return
        gen_section_id = project_state.singletonSections.GenPythonCode
        if gen_section_id is None:
            project_state.genCodeBinding = self._build_fallback_gen_code_binding(
                project_state
            )
            return
        gen_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            gen_section_id,
            GenPythonCodeSectionImpl,
        )
        if gen_impl.codeFileBinding is None:
            project_state.genCodeBinding = self._build_fallback_gen_code_binding(
                project_state
            )
            return
        project_state.genCodeBinding = gen_impl.codeFileBinding

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
        project_state: "ProjectStateSingleConfig",
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

    def _resolve_session_code_root(self, session_id: str) -> Path:
        return (self.dbe.runtime_root / "share_sessions" / session_id).resolve()

    def _resolve_session_code_binding(
        self,
        binding: CodeFileBinding,
        session_root: Path,
    ) -> CodeFileBinding:
        path = binding.canonical_path
        if path.is_absolute():
            if path.is_relative_to(self.deployment_root):
                relative = path.relative_to(self.deployment_root)
            else:
                relative = Path(path.name)
        else:
            relative = path
        resolved = (session_root / relative).resolve()
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

    def _rebase_session_code_paths(
        self,
        project_state: "ProjectStateSingleConfig",
        session_id: str,
    ) -> None:
        session_root = self._resolve_session_code_root(session_id)
        session_root.mkdir(parents=True, exist_ok=True)

        def resolve_code_binding(binding: CodeFileBinding) -> CodeFileBinding:
            return self._resolve_session_code_binding(binding, session_root)

        rewrite_project_state_paths(
            project_state,
            resolve_artifact_path=lambda path_str: path_str,
            resolve_code_binding=resolve_code_binding,
            resolve_json_source_name=lambda path_str: path_str,
        )
        gen_binding = project_state.genCodeBinding
        if gen_binding is not None:
            project_state.genCodeBinding = resolve_code_binding(gen_binding)

    def _resolve_run_snapshot_mode(self) -> RunSnapshotMode:
        return self.share_policy.runSnapshotMode

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
        project_config = project_state.projectConfig
        code_generator = PythonCodeGenerator(
            dep_graph,
            project_config.genCodePrefix,
            project_config.genCodeSuffix,
            value_mode=PythonValueMode.PACKAGED_RUNTIME,
        )
        code_generator.generate_code()
        return code_generator.code

    def _create_share_run_folder(self, share_session_id: str) -> Path:
        run_root = self.share_runs_root / share_session_id
        return create_timestamped_folder(run_root)

    def _write_snapshot_file(
        self, target_folder: Path, binding: "CodeFileBinding", code: str
    ) -> Path:
        target_folder.mkdir(parents=True, exist_ok=True)
        target_path = target_folder / binding.canonical_path.name
        target_path.write_text(code, encoding="utf-8")
        return target_path

    def _build_run_command(self, language: CodeLanguage, path: Path) -> str:
        if language == CodeLanguage.python:
            return self._build_python_run_command(path)
        return self._build_bash_run_command(path)

    def _build_python_run_command(self, path: Path) -> str:
        return f"python {path.resolve()}"

    def _build_bash_run_command(self, path: Path) -> str:
        return f"bash {path.resolve()}"

    async def apply_listener_emit_updates(
        self,
        *,
        share_session_id: str | None,
        dependency_updates: list[ListenerFrontendEmitKeyAndValue],
        artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    ) -> None:
        if not dependency_updates and not artifact_updates:
            raise ValueError("listener emits require dependency or artifact updates")

        dependency_section_ids = [
            update.dependencyKey.sectionId for update in dependency_updates
        ]

        if share_session_id is None:
            raise KeyError("Share listener emit missing share session id")
        if share_session_id not in self._session_states:
            raise KeyError(f"Unknown share session state: {share_session_id}")
        session_id = share_session_id
        project_state = self._session_states[session_id]
        artifact_payloads = []

        artifact_section_ids: list[ID] = []
        if artifact_updates:
            artifact_section_ids, unknown_paths = resolve_section_ids_for_artifacts(
                project_state, artifact_updates
            )
            await ensure_share_artifact_paths_scoped(
                share_mode=True,
                policy=self.share_policy,
                frontend_sender=self.frontend_sender,
                project_config_id=self.project_config_id,
                share_session_id=share_session_id,
                unknown_paths=unknown_paths,
            )

        combined_section_ids = dependency_section_ids + artifact_section_ids
        await ensure_share_listener_emits_allowed(
            share_mode=True,
            policy=self.share_policy,
            frontend_sender=self.frontend_sender,
            project_config_id=self.project_config_id,
            share_session_id=share_session_id,
            section_ids=combined_section_ids if combined_section_ids else None,
        )

        if dependency_updates:
            apply_listener_dependency_updates(
                project_state=project_state,
                updates=dependency_updates,
            )

        if artifact_updates:
            artifact_payloads = apply_listener_artifact_updates(
                artifacts=self.get_session_artifacts(session_id),
                updates=artifact_updates,
            )

        if dependency_updates:
            self.update(project_state)
            session_manager = self._session_managers.get(session_id)
            if session_manager is not None:
                await session_manager.replace_session_state(project_state)
            await self.frontend_sender.broadcast_project_state(
                project_state,
                completedOpIds=[],
                pendingOpIds=[],
                share_session_id=session_id,
            )

        if artifact_payloads:
            await self.frontend_sender.broadcast_artifacts_update(
                artifacts=artifact_payloads,
                updateType="update",
                share_session_id=session_id,
            )
