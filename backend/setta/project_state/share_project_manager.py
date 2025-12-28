from pathlib import Path
from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.listener_artifact_updates import (
    apply_listener_artifact_updates,
)
from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.share.policy import (
    ensure_share_listener_emits_allowed,
    load_share_policy_from_dbe,
)
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.id import ID
from setta.types.listener import ListenerFrontendEmitKeyAndValue
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest

if TYPE_CHECKING:
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
        self.project_config_id = self._resolve_project_config_id()
        self.share_policy: "SharePolicy" = load_share_policy_from_dbe(self.dbe)
        if self.manifest is not None and self.manifest.listener is not None:
            self.share_policy.listenerIsolation = self.manifest.listener.isolation
        self._session_states: dict[str, "ProjectStateSingleConfig"] = {}
        self._session_artifacts: dict[str, Artifacts] = {}
        self._artifact_watcher = SpecificFileWatcher()

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
        if session_id in self._session_artifacts:
            del self._session_artifacts[session_id]

    def get_session_artifacts(self, session_id: str) -> Artifacts:
        if session_id in self._session_artifacts:
            return self._session_artifacts[session_id]
        artifacts = Artifacts(self.frontend_sender, self._artifact_watcher, self.dbe)
        self._session_artifacts[session_id] = artifacts
        return artifacts

    def get_session_ids(self) -> list[str]:
        return list(self._session_states.keys())

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

    def build_base_state(self) -> "ProjectStateSingleConfig":
        return self._build_base_state()

    def _validate_project_state(
        self, project_state: "ProjectStateSingleConfig"
    ) -> None:
        project_state.validate_singleton_sections()
        project_state.validate_parent_section_map()
        project_state.validate_view_modes()
        project_state.validate_shown_param_ids()
        project_state.validate_yaml_values()
        project_state.validate_required_decoded_images()

    async def apply_listener_emit_updates(
        self,
        *,
        share_session_id: str | None,
        dependency_updates: list[ListenerFrontendEmitKeyAndValue],
        artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    ) -> None:
        if not dependency_updates and not artifact_updates:
            raise ValueError("listener emits require dependency or artifact updates")

        await ensure_share_listener_emits_allowed(
            share_mode=True,
            policy=self.share_policy,
            frontend_sender=self.frontend_sender,
            project_config_id=self.project_config_id,
        )

        if share_session_id is None:
            session_ids = self.get_session_ids()
            if not session_ids:
                raise KeyError("Share listener emit missing active sessions")
        else:
            if share_session_id not in self._session_states:
                raise KeyError(f"Unknown share session state: {share_session_id}")
            session_ids = [share_session_id]

        for session_id in session_ids:
            project_state = self._session_states[session_id]
            artifact_payloads = []

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
