from pathlib import Path
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig


class ShareProjectManager:
    def __init__(self, dbe: DBE, deployment_root: Path) -> None:
        self.dbe = dbe
        self.deployment_root = deployment_root
        self.project_state_backend = self.load_initial_state()
        self.manifest = self._load_manifest()
        self.project_config_id = self._resolve_project_config_id()
        self._session_states: dict[str, "ProjectStateSingleConfig"] = {}

    def load_initial_state(self) -> ProjectStateBackend:
        return self.dbe.read_project()

    def create_session_state(self, session_id: str) -> "ProjectStateSingleConfig":
        if session_id in self._session_states:
            raise KeyError(f"Share session already exists: {session_id}")
        project_state = self._build_base_state()
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

    def _load_manifest(self) -> ShareDeploymentManifest | None:
        manifest_path = self.deployment_root / "manifest.json"
        if not manifest_path.exists():
            return None
        payload = self.dbe.read_json(manifest_path)
        if not payload:
            return None
        return ShareDeploymentManifest.model_validate(payload)

    def _resolve_project_config_id(self) -> ID:
        if self.manifest is not None:
            project_config_id = self.manifest.projectConfigId
            if project_config_id not in self.project_state_backend.projectConfigs:
                raise KeyError(
                    "Share deployment manifest references missing project config: "
                    f"{project_config_id}"
                )
            return project_config_id
        default_id = self.project_state_backend.defaultProjectConfigId
        if default_id is not None:
            return default_id
        if not self.project_state_backend.projectConfigs:
            raise KeyError("Share deployment missing project configs")
        return next(iter(self.project_state_backend.projectConfigs))

    def _build_base_state(self) -> "ProjectStateSingleConfig":
        base_state = convert_backend_to_single_config(
            self.project_state_backend, self.project_config_id
        )
        session_state = base_state.model_copy(deep=True)
        self._validate_project_state(session_state)
        return session_state

    def _validate_project_state(
        self, project_state: "ProjectStateSingleConfig"
    ) -> None:
        project_state.validate_singleton_sections()
        project_state.validate_parent_section_map()
        project_state.validate_view_modes()
        project_state.validate_shown_param_ids()
        project_state.validate_yaml_values()
        project_state.validate_required_decoded_images()
