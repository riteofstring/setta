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
from setta.types.project_state import ProjectStateBackend
from setta.utils.name_validation import validate_project_name

if TYPE_CHECKING:
    from setta.database.settings_file import SettingsFile
    from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
    from setta.lsp.managers import LSPWriters
    from setta.project_state.artifacts import Artifacts
    from setta.project_state.code_files import CodeFiles
    from setta.project_state.jsonSource.jsonSource import JSONSource
    from setta.project_state.share_runtime_state import ShareRuntimeState
    from setta.types.generated.unions import BaseArtifactUnionWithDiscriminator
    from setta.types.listener import ListenerFrontendEmitKeyAndValue
    from setta.types.project_state import ProjectStateSingleConfig
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
    from setta.websockets.msg_handlers.python_script_sender import WMHPythonScriptSender


class SessionPersistenceMode(str, Enum):
    share = "share"
    ide_main = "ide_main"
    ide_settings = "ide_settings"


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
        )

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
        if self.share_runtime_state is None:
            if self.persistence_mode == SessionPersistenceMode.ide_settings:
                self._save_settings_project()
            elif self.persistence_mode == SessionPersistenceMode.ide_main:
                self._save_project_state()

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
        self._mark_current_frontend_op_completed_before_broadcast()
        completed_op_ids = self.completed_op_ids_since_last_broadcast
        pending_op_ids = list(self.pending_frontend_ops.keys())
        redacted = self.share_runtime_state.format_project_state_for_client(
            project_state
        )
        await self.websocket_msg_handler.broadcast_project_state(
            redacted,
            completed_op_ids,
            pending_op_ids,
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
            share_mode=True,
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
        load_json_sources_into_data_structures(
            project_state,
            json_sources,
            section_variants_to_load,
        )
        apply_settings_display_names(
            project_state, existing_code_obj_ids=existing_code_obj_ids
        )

        for config_id in project_state.projectConfigs.keys():
            single_config = convert_backend_to_single_config(project_state, config_id)
            await self.update_and_broadcast_project_state(
                single_config,
                updateFileWatcher=False,
            )
        await self.settings_file.load_and_broadcast_settings()

    def _save_project_state(self) -> None:
        self.flush_code_files_for_all_configs()
        payload = self.project_state_backend.model_copy(deep=True)
        save_json_source_data(self.dbe, payload)
        remove_json_source_values(payload)
        strip_password_values(payload)
        maybe_create_backup(
            self.dbe.project,
            self.settings_file.settings.backend.autobackup,
            self.settings_file.settings.backend.autobackupFreq,
            self.settings_file.settings.backend.autobackupKeepLastN,
        )
        self.dbe.write_project(payload)
        self.artifacts.save()
        self._maybe_export_readable_project()

    def _maybe_export_readable_project(self) -> None:
        backend_settings = self.settings_file.settings.backend
        export_readable = backend_settings.exportDbReadableOnSave
        export_with_variants = backend_settings.exportDbReadableWithVariantsOnSave
        if not export_readable and not export_with_variants:
            return
        sanitized = self.project_state_backend.model_copy(deep=True)
        strip_password_values(sanitized)
        payload = build_readable_project_export(
            sanitized,
            include_variants=export_with_variants,
        )
        output_path = self.dbe.path / "project.readable.yaml"
        yaml_payload = yaml.safe_dump(payload, sort_keys=False)
        self.dbe.write(output_path, yaml_payload)

    def _save_settings_project(self) -> None:
        self.flush_code_files_for_all_configs()
        default_id = self.project_state_backend.defaultProjectConfigId
        if not default_id:
            raise ValueError("Missing default project config id")
        project_state = convert_backend_to_single_config(
            self.project_state_backend,
            default_id,
        )
        project_state = project_state.model_copy(deep=True)
        save_json_source_data(self.dbe, project_state)
        remove_json_source_values(project_state)
        strip_password_values(project_state)
        self.dbe.write_settings_project(project_state)
        self.artifacts.save()
