import asyncio
import threading
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

import yaml

from setta.database.backup import maybe_create_backup
from setta.lsp.managers import NoopLSPWriters
from setta.project_state.base_project_manager import BaseProjectManager
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.jsonSource.save import (
    remove_json_source_values,
    save_json_source_data,
)
from setta.project_state.project_manager_types import (
    RunCodeRequest,
    RunDetachedRequest,
    SaveAsNewProjectConfigRequest,
)
from setta.project_state.readable_export import build_readable_project_export
from setta.project_state.secret_values import strip_password_values
from setta.project_state.settings_project import apply_settings_display_names
from setta.share.policy import ensure_share_listener_emit_updates_allowed
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    copy_project,
    copy_project_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.notifications import (
    SettaBackendLogEventSeverity,
    SettaNotification,
    SettaNotificationType,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.utils.name_validation import validate_project_name

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.lsp.managers import LSPWriters
    from setta.plugins.manager import PluginManager
    from setta.project_state.artifacts import Artifacts
    from setta.project_state.code_files import CodeFiles
    from setta.project_state.jsonSource.jsonSource import JSONSource
    from setta.project_state.share_runtime_state import ShareRuntimeState
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.types.listener import ListenerFrontendEmitKeyAndValue
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
    from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class SessionPersistenceMode(str, Enum):
    share = "share"
    ide_main = "ide_main"
    ide_settings = "ide_settings"


@dataclass(slots=True)
class _SaveWorkItem:
    revision: int
    source_backend: ProjectStateBackend
    default_project_config_id: ID | None
    payload: ProjectStateBackend | ProjectStateSingleConfig | None
    autobackup: bool
    autobackup_freq: int
    autobackup_keep_last_n: int
    export_readable: bool
    export_with_variants: bool


class SessionProjectManager(BaseProjectManager):
    def __init__(
        self,
        *,
        persistence_mode: SessionPersistenceMode,
        frontend_sender: "WMHFrontendSender",
        python_script_sender: "WMHPythonScriptSender",
        settings_file: "SettingsFile",
        specific_file_watcher: "SpecificFileWatcher",
        dbe,
        artifacts: "Artifacts",
        json_source: "JSONSource",
        code_files: "CodeFiles",
        lsp_writers: "LSPWriters | None" = None,
        share_runtime_state: "ShareRuntimeState | None" = None,
        share_session_id: str | None = None,
        plugin_manager: "PluginManager | None" = None,
    ) -> None:
        self.persistence_mode = persistence_mode
        self.share_runtime_state = share_runtime_state
        self.share_session_id = share_session_id
        resolved_lsp_writers = lsp_writers or NoopLSPWriters()
        resolved_sender = (
            frontend_sender.scoped(share_session_id)
            if share_runtime_state is not None
            else frontend_sender
        )
        super().__init__(
            lsp_writers=resolved_lsp_writers,
            websocket_msg_handler=resolved_sender,
            python_script_sender=python_script_sender,
            settings_file=settings_file,
            specific_file_watcher=specific_file_watcher,
            dbe=dbe,
            artifacts=artifacts,
            json_source=json_source,
            code_files=code_files,
            plugin_manager=plugin_manager,
        )
        self._save_condition = threading.Condition()
        self._save_worker_thread: threading.Thread | None = None
        self._save_worker_shutdown = False
        self._pending_save_work_item: _SaveWorkItem | None = None
        self._save_inflight_revision: int | None = None
        self._last_save_error: tuple[int, Exception] | None = None

    def load_initial_state(self) -> ProjectStateBackend:
        if self.share_runtime_state is not None:
            share_session_id = self.share_runtime_state.require_session_id(
                self.share_session_id
            )
            return self.share_runtime_state.get_or_create_session_backend(
                share_session_id
            )
        if self.persistence_mode == SessionPersistenceMode.ide_settings:
            project_state = self.settings_file.load_settings_project()
            json_source_paths, json_source_to_section_variants = (
                self.json_source.get_json_source_files_to_watch(project_state)
            )
            if json_source_paths:
                processed_sources = self.json_source.process_json_source_files(
                    json_source_paths
                )
                if processed_sources:
                    self.json_source.json_sources.update(processed_sources)
                    section_variants: set[tuple[ID, ID]] = set()
                    for variants in json_source_to_section_variants.values():
                        section_variants.update(variants)
                    if section_variants:
                        load_json_sources_into_data_structures(
                            project_state,
                            processed_sources,
                            section_variants,
                        )
            strip_password_values(project_state)
            return merge_single_config_into_backend(
                ProjectStateBackend(), project_state
            )
        project_state = self.dbe.read_project()
        strip_password_values(project_state)
        return project_state

    def get_new_project_state_backend(
        self,
        x: "ProjectStateSingleConfig",
    ) -> ProjectStateBackend:
        if self.share_runtime_state is None:
            return super().get_new_project_state_backend(x)
        share_session_id = self.share_runtime_state.require_session_id(
            self.share_session_id
        )
        return self.share_runtime_state.update_session_state(
            share_session_id,
            x.projectConfig.id,
            x,
        )

    def save(self) -> None:
        revision = self._queue_save_for_current_revision()
        if revision is None:
            return
        self._wait_for_persisted_revision(revision)

    async def autosave(self):
        try:
            revision = self._queue_save_for_current_revision()
            if revision is not None:
                await asyncio.to_thread(self._wait_for_persisted_revision, revision)
            await self._flush_deferred_json_source_loads()
            notification = SettaNotification(
                message="Autosaved!", type=SettaNotificationType.save
            )
            await self.websocket_msg_handler.broadcast_notification(notification)
        except Exception as exc:
            await (
                self.websocket_msg_handler.log_failure_and_broadcast_backend_log_event(
                    exc,
                    label="autosave",
                    message="Failed to autosave",
                    severity=SettaBackendLogEventSeverity.error,
                )
            )

    def _queue_save_for_current_revision(self) -> int | None:
        if self.share_runtime_state is not None:
            return None
        revision = self.history.revision
        with self._save_condition:
            if (
                self._last_persisted_history_revision is not None
                and self._last_persisted_history_revision >= revision
            ):
                return None
            pending_revision = (
                self._pending_save_work_item.revision
                if self._pending_save_work_item is not None
                else None
            )
            inflight_revision = self._save_inflight_revision
            if pending_revision is not None and pending_revision >= revision:
                return revision
            if inflight_revision is not None and inflight_revision >= revision:
                return revision

        work_item = self._build_save_work_item(revision)
        with self._save_condition:
            if (
                self._last_persisted_history_revision is not None
                and self._last_persisted_history_revision >= revision
            ):
                return None
            pending_revision = (
                self._pending_save_work_item.revision
                if self._pending_save_work_item is not None
                else None
            )
            inflight_revision = self._save_inflight_revision
            if pending_revision is not None and pending_revision >= revision:
                return revision
            if (
                pending_revision is None
                and inflight_revision is not None
                and inflight_revision >= revision
            ):
                return revision
            self._pending_save_work_item = work_item
            if (
                self._last_save_error is not None
                and self._last_save_error[0] <= revision
            ):
                self._last_save_error = None
            self._ensure_save_worker_locked()
            self._save_condition.notify_all()
        return revision

    def _wait_for_persisted_revision(self, revision: int) -> None:
        with self._save_condition:
            while True:
                if (
                    self._last_persisted_history_revision is not None
                    and self._last_persisted_history_revision >= revision
                ):
                    return
                pending_revision = (
                    self._pending_save_work_item.revision
                    if self._pending_save_work_item is not None
                    else None
                )
                inflight_revision = self._save_inflight_revision
                has_path_to_target = (
                    pending_revision is not None and pending_revision >= revision
                ) or (inflight_revision is not None and inflight_revision >= revision)
                if self._save_worker_shutdown:
                    raise RuntimeError("Save worker has been shut down.")
                if self._last_save_error is not None:
                    failed_revision, failed_error = self._last_save_error
                    if failed_revision >= revision and not has_path_to_target:
                        raise failed_error
                if not has_path_to_target:
                    raise RuntimeError(
                        f"Missing queued save work item for revision {revision}."
                    )
                self._save_condition.wait()

    def _ensure_save_worker_locked(self) -> None:
        if self._save_worker_thread is not None and self._save_worker_thread.is_alive():
            return
        self._save_worker_thread = threading.Thread(
            target=self._save_worker_loop,
            name=f"{type(self).__name__}-save-worker",
            daemon=True,
        )
        self._save_worker_thread.start()

    def _save_worker_loop(self) -> None:
        while True:
            with self._save_condition:
                while (
                    self._pending_save_work_item is None
                    and not self._save_worker_shutdown
                ):
                    self._save_condition.wait()
                if self._save_worker_shutdown:
                    return
                work_item = self._pending_save_work_item
                if work_item is None:
                    continue
                self._pending_save_work_item = None
                self._save_inflight_revision = work_item.revision

            try:
                self._resolve_save_work_item_payload(work_item)
                self._persist_save_work_item(work_item)
            except Exception as exc:
                with self._save_condition:
                    self._last_save_error = (work_item.revision, exc)
                    self._save_inflight_revision = None
                    self._save_condition.notify_all()
                continue

            with self._save_condition:
                if (
                    self._last_persisted_history_revision is None
                    or work_item.revision > self._last_persisted_history_revision
                ):
                    self._last_persisted_history_revision = work_item.revision
                self._save_inflight_revision = None
                if (
                    self._last_save_error is not None
                    and self._last_persisted_history_revision is not None
                    and self._last_save_error[0]
                    <= self._last_persisted_history_revision
                ):
                    self._last_save_error = None
                self._save_condition.notify_all()

    def _resolve_save_work_item_payload(self, work_item: _SaveWorkItem) -> None:
        if work_item.payload is not None:
            return
        if self.persistence_mode == SessionPersistenceMode.ide_settings:
            default_id = work_item.default_project_config_id
            if default_id is None:
                raise ValueError("Missing default project config id for settings save.")
            project_state = convert_backend_to_single_config(
                work_item.source_backend,
                default_id,
            )
            work_item.payload = project_state.model_copy(deep=True)
            return
        if self.persistence_mode == SessionPersistenceMode.ide_main:
            work_item.payload = work_item.source_backend.model_copy(deep=True)
            return
        raise ValueError(f"Unsupported persistence mode: {self.persistence_mode}")

    def _build_save_work_item(self, revision: int) -> _SaveWorkItem:
        self.flush_code_files_for_all_configs()
        source_backend = self.project_state_backend
        if self.persistence_mode == SessionPersistenceMode.ide_settings:
            default_id = source_backend.defaultProjectConfigId
            if not default_id:
                raise ValueError("Missing default project config id")
            return _SaveWorkItem(
                revision=revision,
                source_backend=source_backend,
                default_project_config_id=default_id,
                payload=None,
                autobackup=False,
                autobackup_freq=0,
                autobackup_keep_last_n=0,
                export_readable=False,
                export_with_variants=False,
            )
        if self.persistence_mode == SessionPersistenceMode.ide_main:
            backend_settings = self.settings_file.settings.backend
            return _SaveWorkItem(
                revision=revision,
                source_backend=source_backend,
                default_project_config_id=None,
                payload=None,
                autobackup=backend_settings.autobackup,
                autobackup_freq=backend_settings.autobackupFreq,
                autobackup_keep_last_n=backend_settings.autobackupKeepLastN,
                export_readable=backend_settings.exportDbReadableOnSave,
                export_with_variants=backend_settings.exportDbReadableWithVariantsOnSave,
            )
        raise ValueError(f"Unsupported persistence mode: {self.persistence_mode}")

    def _persist_save_work_item(self, work_item: _SaveWorkItem) -> None:
        if work_item.payload is None:
            raise RuntimeError("Save work item payload is not prepared.")
        if self.persistence_mode == SessionPersistenceMode.ide_settings:
            if not isinstance(work_item.payload, ProjectStateSingleConfig):
                raise TypeError(
                    "Settings save expects ProjectStateSingleConfig payload."
                )
            payload = work_item.payload
            save_json_source_data(self.dbe, payload)
            remove_json_source_values(payload)
            strip_password_values(payload)
            self.dbe.write_settings_project(payload)
            self.artifacts.save()
            return
        if self.persistence_mode == SessionPersistenceMode.ide_main:
            if not isinstance(work_item.payload, ProjectStateBackend):
                raise TypeError("Project save expects ProjectStateBackend payload.")
            payload = work_item.payload
            save_json_source_data(self.dbe, payload)
            strip_password_values(payload)
            readable_yaml_payload: str | None = None
            if work_item.export_readable or work_item.export_with_variants:
                readable_payload = build_readable_project_export(
                    payload,
                    include_variants=work_item.export_with_variants,
                )
                readable_yaml_payload = yaml.safe_dump(
                    readable_payload,
                    sort_keys=False,
                )
            remove_json_source_values(payload)
            maybe_create_backup(
                self.dbe.project,
                work_item.autobackup,
                work_item.autobackup_freq,
                work_item.autobackup_keep_last_n,
            )
            self.dbe.write_project(payload)
            self.artifacts.save()
            if readable_yaml_payload is not None:
                output_path = self.dbe.path / "project.readable.yaml"
                self.dbe.write(output_path, readable_yaml_payload)
            return
        raise ValueError(f"Unsupported persistence mode: {self.persistence_mode}")

    def shutdown(self) -> None:
        super().shutdown()
        with self._save_condition:
            self._save_worker_shutdown = True
            self._save_condition.notify_all()
        if self._save_worker_thread is not None:
            self._save_worker_thread.join(timeout=5)

    async def save_as_new_project_config(
        self, x: SaveAsNewProjectConfigRequest
    ) -> None:
        if self.share_runtime_state is not None:
            raise NotImplementedError(
                "Share mode does not support project config writes"
            )
        if self.persistence_mode != SessionPersistenceMode.ide_main:
            raise ValueError("Settings projects do not support project config writes")
        project_state = convert_backend_to_single_config(
            self.project_state_backend, x.projectConfigId
        )
        normalized_name = validate_project_name(
            self.project_state_backend, None, x.newConfigName
        )
        if x.withRefs:
            new_project_config = copy_project_config(
                project_state.projectConfig, normalized_name, do_create_new_id=True
            )
            self.project_state_backend.projectConfigs[new_project_config.id] = (
                new_project_config
            )
            self._mark_current_backend_revision_dirty()
        else:
            new_project_config = copy_project(
                project_state, normalized_name, do_create_new_id=True
            )
            self.project_state_backend = merge_single_config_into_backend(
                self.project_state_backend, new_project_config
            )
        self.perform_manual_save()
        await self.broadcast_all_project_metadata()

    async def update(
        self,
        projectState: "ProjectStateSingleConfig",
        updateFileWatcher: bool = True,
        validate_code_file_bindings: bool = True,
        validate_name_rules: bool = True,
    ) -> None:
        if self.share_runtime_state is None:
            await super().update(
                projectState,
                updateFileWatcher=updateFileWatcher,
                validate_code_file_bindings=validate_code_file_bindings,
                allow_reserved_project_name=(
                    self.persistence_mode == SessionPersistenceMode.ide_settings
                ),
                validate_name_rules=validate_name_rules,
            )
            return
        async with self._project_state_lock.write_lock():
            self.share_runtime_state.normalize_project_state_paths(projectState)
            projectState.validate_for_update(
                validate_code_file_bindings=False,
                allow_reserved_project_name=False,
                validate_name_rules=validate_name_rules,
            )
            if self.share_runtime_state.should_refresh_codegen():
                await self._refresh_codegen_state(projectState)
            self._merge_project_state_backend(
                projectState,
                updateFileWatcher=updateFileWatcher,
            )

    async def _broadcast_project_state_snapshot(
        self,
        project_state: "ProjectStateSingleConfig",
    ) -> None:
        if self.share_runtime_state is None:
            await super()._broadcast_project_state_snapshot(project_state)
            return
        completed_op_ids, pending_op_ids = (
            self._consume_frontend_op_status_for_broadcast()
        )
        project_state_revision = self.history.revision
        redacted = self.share_runtime_state.format_project_state_for_client(
            project_state
        )
        await self.websocket_msg_handler.broadcast_project_state(
            redacted,
            completed_op_ids,
            pending_op_ids,
            project_state_revision,
        )
        self.completed_op_ids_since_last_broadcast = []

    @BaseProjectManager.enqueue_method
    async def apply_listener_emit_updates(
        self,
        projectConfigId: ID,
        dependency_updates: list["ListenerFrontendEmitKeyAndValue"],
        artifact_updates: list["BaseArtifactUnionWithDiscriminator"],
    ) -> None:
        if self.share_runtime_state is None:
            # Avoid double-enqueueing by calling the base implementation directly.
            await BaseProjectManager.apply_listener_emit_updates.__wrapped__(
                self,
                projectConfigId=projectConfigId,
                dependency_updates=dependency_updates,
                artifact_updates=artifact_updates,
            )
            return
        if not dependency_updates and not artifact_updates:
            raise ValueError("listener emits require dependency or artifact updates")
        share_session_id, project_state = (
            self.share_runtime_state.require_session_state(
                self.share_session_id,
                projectConfigId,
            )
        )
        await ensure_share_listener_emit_updates_allowed(
            deployment_mode=True,
            policy=self.share_runtime_state.share_policy,
            frontend_sender=self.share_runtime_state.frontend_sender,
            share_session_id=share_session_id,
        )
        await self._apply_listener_emit_updates_to_state(
            project_state,
            dependency_updates,
            artifact_updates,
        )

    @BaseProjectManager.enqueue_method
    async def create_run_command(
        self,
        x: RunCodeRequest,
    ) -> str:
        if self.share_runtime_state is None:
            return await BaseProjectManager.create_run_command.__wrapped__(self, x)
        return await self.share_runtime_state.create_run_command(
            self.share_session_id,
            x,
        )

    @BaseProjectManager.enqueue_method
    async def create_run_command_with_overrides(
        self,
        x: RunDetachedRequest,
    ) -> tuple[str, Path, ID | None]:
        if self.share_runtime_state is None:
            return (
                await BaseProjectManager.create_run_command_with_overrides.__wrapped__(
                    self, x
                )
            )
        raise NotImplementedError("Share mode does not support detached run overrides.")

    @BaseProjectManager.enqueue_method
    async def load_json_sources(
        self,
        json_sources: dict[Path, object],
        section_variants_to_load: list[tuple[str, str]],
    ):
        if self.persistence_mode != SessionPersistenceMode.ide_settings:
            await BaseProjectManager.load_json_sources.__wrapped__(
                self,
                json_sources=json_sources,
                section_variants_to_load=section_variants_to_load,
            )
            return
        project_state = self.project_state_backend
        existing_code_obj_ids = set(project_state.codeObjs.keys())
        mutation_scope = load_json_sources_into_data_structures(
            project_state,
            json_sources,
            section_variants_to_load,
        )
        apply_settings_display_names(
            project_state, existing_code_obj_ids=existing_code_obj_ids
        )
        for code_obj_id in project_state.codeObjs:
            if code_obj_id in existing_code_obj_ids:
                continue
            mutation_scope.code_obj_ids.add(code_obj_id)
        await self._broadcast_json_source_load_mutation_scope(mutation_scope)
        await self.settings_file.load_and_broadcast_settings()
