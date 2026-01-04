from typing import TYPE_CHECKING

from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.logging.context import LoggingContextInput
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.code_files import CodeFiles
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.listener_artifact_updates import (
    apply_listener_artifact_updates,
)
from setta.project_state.listener_dependency_updates import (
    apply_listener_dependency_updates,
)
from setta.project_state.project_manager_types import SaveAsNewProjectConfigRequest
from setta.share.policy import (
    ensure_share_artifact_paths_scoped,
    ensure_share_listener_emits_allowed,
    resolve_section_ids_for_artifacts,
)
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.id import ID
from setta.types.notifications import SettaBackendLogEventSeverity, SettaNotification
from setta.types.project_state import ProjectStateBackend
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender

if TYPE_CHECKING:
    from setta.lsp.managers import LSPWriters
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.types.listener import ListenerFrontendEmitKeyAndValue
    from setta.types.project_state import ProjectStateSingleConfig


class ShareSessionFrontendSender:
    def __init__(self, sender: WMHFrontendSender, share_session_id: str) -> None:
        self._sender = sender
        self._share_session_id = share_session_id

    async def broadcast_project_state(
        self,
        projectState: "ProjectStateSingleConfig",
        completedOpIds: list[str],
        pendingOpIds: list[str],
    ) -> None:
        await self._sender.broadcast_project_state(
            projectState,
            completedOpIds,
            pendingOpIds,
            share_session_id=self._share_session_id,
        )

    async def broadcast_all_project_metadata(
        self,
        defaultProjectConfigId: str | None,
        projectMetadata: list,
    ) -> None:
        await self._sender.broadcast_all_project_metadata(
            defaultProjectConfigId=defaultProjectConfigId,
            projectMetadata=projectMetadata,
            share_session_id=self._share_session_id,
        )

    async def broadcast_notification(self, notification: SettaNotification) -> None:
        await self._sender.broadcast_notification(
            notification,
            share_session_id=self._share_session_id,
        )

    async def broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
    ) -> None:
        await self._sender.broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
        )

    async def log_and_broadcast_backend_log_event(
        self,
        message: str,
        *,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info,
        project_config_id: ID | None = None,
        logger=None,
        context: dict[str, LoggingContextInput] | None = None,
    ) -> None:
        await self._sender.log_and_broadcast_backend_log_event(
            message,
            severity=severity,
            project_config_id=project_config_id,
            logger=logger,
            context=context,
            share_session_id=self._share_session_id,
        )

    async def log_failure_and_broadcast_backend_log_event(
        self,
        exc: BaseException,
        label: str,
        message: str,
        severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.error,
        project_config_id: ID | None = None,
        handled: bool = False,
        logger=None,
        context: dict[str, LoggingContextInput] | None = None,
    ) -> None:
        await self._sender.log_failure_and_broadcast_backend_log_event(
            exc,
            label,
            message,
            severity=severity,
            project_config_id=project_config_id,
            handled=handled,
            logger=logger,
            context=context,
            share_session_id=self._share_session_id,
        )

    async def broadcast_artifacts_update(
        self, artifacts: list, updateType: str
    ) -> None:
        await self._sender.broadcast_artifacts_update(
            artifacts=artifacts,
            updateType=updateType,
            share_session_id=self._share_session_id,
        )

    async def broadcast_rename_refactor_results(self, content) -> None:
        await self._sender.broadcast_rename_refactor_results(
            content,
            share_session_id=self._share_session_id,
        )


class _NoopLSPWriters:
    full = None


class ShareSessionProjectManager(BaseProjectManager):
    def __init__(
        self,
        *,
        share_project_manager,
        share_session_id: str,
        settings_file,
        python_script_sender: WMHPythonScriptSender,
        lsp_writers: "LSPWriters | None" = None,
    ) -> None:
        self.share_project_manager = share_project_manager
        self.share_session_id = share_session_id
        self._allow_lsp = lsp_writers is not None
        self._frontend_sender = ShareSessionFrontendSender(
            share_project_manager.frontend_sender,
            share_session_id,
        )
        specific_file_watcher = SpecificFileWatcher()
        artifacts = share_project_manager.get_session_artifacts(share_session_id)
        json_source = JSONSource(
            self._frontend_sender,
            settings_file,
            specific_file_watcher,
            share_project_manager.dbe,
        )
        code_files = CodeFiles(
            self._frontend_sender,
            specific_file_watcher,
            share_project_manager.dbe,
        )
        resolved_lsp_writers = lsp_writers or _NoopLSPWriters()
        super().__init__(
            lsp_writers=resolved_lsp_writers,
            websocket_msg_handler=self._frontend_sender,
            python_script_sender=python_script_sender,
            settings_file=settings_file,
            specific_file_watcher=specific_file_watcher,
            dbe=share_project_manager.dbe,
            artifacts=artifacts,
            json_source=json_source,
            code_files=code_files,
        )

    def load_initial_state(self) -> ProjectStateBackend:
        session_state = self.share_project_manager.get_or_create_session_state(
            self.share_session_id
        )
        return merge_single_config_into_backend(ProjectStateBackend(), session_state)

    def save(self) -> None:
        return None

    async def save_as_new_project_config(
        self, x: SaveAsNewProjectConfigRequest
    ) -> None:
        raise NotImplementedError("Share mode does not support project config writes")

    def watch_json_source_files(self) -> None:
        return None

    def watch_artifact_files(self) -> None:
        return None

    def watch_code_files(self) -> None:
        return None

    def add_new_history_entry(self, trigger_autosave: bool = True) -> None:
        _ = trigger_autosave
        self.history.add_current_copy()

    async def update(
        self,
        projectState: "ProjectStateSingleConfig",
        updateFileWatcher: bool = True,
    ) -> None:
        _ = updateFileWatcher
        if self._allow_lsp:
            await BaseProjectManager.update(
                self,
                projectState,
                updateFileWatcher=False,
            )
            self.share_project_manager.update_session_state(
                self.share_session_id,
                projectState,
            )
            return
        async with self._project_state_lock.write_lock():
            self.share_project_manager.update_session_state(
                self.share_session_id,
                projectState,
            )
            self.project_state_backend = self.get_new_project_state_backend(
                projectState
            )

    async def replace_session_state(
        self, projectState: "ProjectStateSingleConfig"
    ) -> None:
        if self._allow_lsp:
            await BaseProjectManager.update(
                self,
                projectState,
                updateFileWatcher=False,
            )
            return
        async with self._project_state_lock.write_lock():
            self.project_state_backend = self.get_new_project_state_backend(
                projectState
            )

    @BaseProjectManager.enqueue_method
    async def apply_listener_emit_updates(
        self,
        dependency_updates: list["ListenerFrontendEmitKeyAndValue"],
        artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    ) -> None:
        if not dependency_updates and not artifact_updates:
            raise ValueError("listener emits require dependency or artifact updates")

        project_state = self.share_project_manager.get_session_state(
            self.share_session_id
        )

        dependency_section_ids = [
            update.dependencyKey.sectionId for update in dependency_updates
        ]

        artifact_section_ids: list[ID] = []
        if artifact_updates:
            artifact_section_ids, unknown_paths = resolve_section_ids_for_artifacts(
                project_state, artifact_updates
            )
            await ensure_share_artifact_paths_scoped(
                share_mode=True,
                policy=self.share_project_manager.share_policy,
                frontend_sender=self.share_project_manager.frontend_sender,
                project_config_id=self.share_project_manager.project_config_id,
                share_session_id=self.share_session_id,
                unknown_paths=unknown_paths,
            )

        combined_section_ids = dependency_section_ids + artifact_section_ids
        await ensure_share_listener_emits_allowed(
            share_mode=True,
            policy=self.share_project_manager.share_policy,
            frontend_sender=self.share_project_manager.frontend_sender,
            project_config_id=self.share_project_manager.project_config_id,
            share_session_id=self.share_session_id,
            section_ids=combined_section_ids if combined_section_ids else None,
        )

        if dependency_updates:
            apply_listener_dependency_updates(
                project_state=project_state,
                updates=dependency_updates,
            )

        artifact_payloads = []
        if artifact_updates:
            artifact_payloads = apply_listener_artifact_updates(
                artifacts=self.artifacts,
                updates=artifact_updates,
            )

        if dependency_updates:
            await self.update_and_broadcast_project_state(project_state)

        if artifact_payloads:
            await self.websocket_msg_handler.broadcast_artifacts_update(
                artifacts=artifact_payloads,
                updateType="update",
            )

    async def ensure_gen_code_ready(self) -> None:
        if not self._allow_lsp:
            return
        project_config_id = self.share_project_manager.project_config_id
        if project_config_id in self.gen_code:
            return
        project_state = self.get_single_config_state(project_config_id)
        await BaseProjectManager.update(
            self,
            project_state,
            updateFileWatcher=False,
        )

    def shutdown(self) -> None:
        self.autosave_debouncer.cancel()
        self.queue_task.cancel()

    @BaseProjectManager.enqueue_method
    async def create_run_command(
        self,
        projectConfigId: ID,
        sectionId: ID | None,
    ) -> str:
        if projectConfigId != self.share_project_manager.project_config_id:
            raise KeyError(f"Unknown share project config: {projectConfigId}")
        return await self.share_project_manager.create_run_command(
            self.share_session_id,
            sectionId,
        )
