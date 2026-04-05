import copy
import logging
import os
from pathlib import Path

from setta.database.db_objs import DBE
from setta.project_state.settings_project import (
    create_settings_project_state,
    ensure_settings_code_objs,
    ensure_settings_view_modes,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import DictSectionImpl
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


def _merge_missing_defaults(existing: object, defaults: object) -> tuple[object, bool]:
    """Return (merged, changed), where merged includes any missing default keys.

    Only merges nested dict shapes; existing values are never overwritten.
    """

    if not isinstance(existing, dict) or not isinstance(defaults, dict):
        return existing, False

    changed = False
    merged: dict = dict(existing)
    for key, default_value in defaults.items():
        if key not in merged:
            merged[key] = copy.deepcopy(default_value)
            changed = True
            continue
        next_value, child_changed = _merge_missing_defaults(merged[key], default_value)
        if child_changed:
            merged[key] = next_value
            changed = True
    return merged, changed


class SettingsFile:
    def __init__(
        self,
        dbe: DBE,
        websocket_msg_handler: WMHFrontendSender,
        *,
        allow_write: bool = True,
    ):
        self.dbe = dbe
        self.websocket_msg_handler = websocket_msg_handler
        self._allow_write = allow_write
        self.settings = self.load_settings()

    async def save_settings(self, settings: SettingsState):
        if not self._allow_write:
            raise ValueError("Settings updates are disabled in share mode.")
        logger.debug("Saving settings")
        paths = self.get_settings_paths()
        settings_dump = settings.model_dump(mode="json")
        to_be_saved = {}
        for settings_slice, path in paths.items():
            if path not in to_be_saved:
                to_be_saved[path] = {}
            to_be_saved[path].update({settings_slice: settings_dump[settings_slice]})

        for filename, data in to_be_saved.items():
            self.dbe.write_json(filename, data)
        await self.load_and_broadcast_settings()

    def load_settings(self) -> SettingsState:
        logger.debug("Loading settings")
        paths = self.get_settings_paths()
        path_set = set(paths.values())
        default_settings = SettingsState().model_dump(mode="json")
        path_to_slices: dict[Path, list[str]] = {}
        for settings_slice, path in paths.items():
            path_to_slices.setdefault(path, []).append(settings_slice)

        contents: dict[Path, object] = {}
        for p in path_set:
            payload = self.dbe.read_json(p)
            if payload is None:
                payload = {}
            if not isinstance(payload, dict):
                raise TypeError(
                    f"Settings file {p} must contain a JSON object at the root."
                )
            changed = False
            for settings_slice in path_to_slices.get(p, []):
                if settings_slice not in default_settings:
                    raise KeyError(f"Missing default settings for {settings_slice}.")
                defaults_slice = default_settings[settings_slice]
                if settings_slice not in payload:
                    payload[settings_slice] = copy.deepcopy(defaults_slice)
                    changed = True
                    continue
                merged_slice, slice_changed = _merge_missing_defaults(
                    payload[settings_slice], defaults_slice
                )
                if slice_changed:
                    payload[settings_slice] = merged_slice
                    changed = True
            if changed and self._allow_write:
                logger.debug(
                    "Migrating settings file %s to include new default keys.",
                    p,
                )
                self.dbe.write_json(p, payload)
            contents[p] = payload
        output = {}
        for settings_slice, path in paths.items():
            payload = contents[path]
            if not isinstance(payload, dict):
                raise TypeError(
                    f"Settings file {path} must contain a JSON object at the root."
                )
            output[settings_slice] = payload.get(
                settings_slice, default_settings[settings_slice]
            )

        self.settings = SettingsState.model_validate(output)
        return self.settings

    async def load_and_broadcast_settings(self):
        self.load_settings()
        await self.websocket_msg_handler.broadcast_settings(self.settings)

    def get_settings_paths(self):
        settings_slice_to_path: dict[str, Path] = {}
        p = self.load_settings_project()
        default_settings = SettingsState().model_dump(mode="json")
        for k in SettingsState.model_fields.keys():
            path = self.find_path_for_settings_slice(p, k)
            if not path.exists() and self._allow_write:
                self.dbe.write_json(path, default_settings)
            settings_slice_to_path[k] = path
        return settings_slice_to_path

    def find_path_for_settings_slice(self, p: ProjectStateSingleConfig, slice: str):
        for sectionId in p.sections.keys():
            impl = get_curr_effective_section_impl_with_type_guard(
                p, sectionId, DictSectionImpl
            )
            if impl.jsonSourceKeys == [slice]:
                variant = get_curr_section_variant(p, sectionId)
                return Path(variant.name)
        return self.dbe.settings

    def load_settings_project(self):
        if not os.path.exists(self.dbe.settings_project):
            project_state = create_settings_project_state(self.dbe.settings)
            if self._allow_write:
                self.dbe.write_settings_project(project_state)
            return project_state
        project_state = self.dbe.read_settings_project()
        needs_write = False
        if ensure_settings_code_objs(project_state):
            needs_write = True
        if ensure_settings_view_modes(project_state):
            needs_write = True
        if needs_write and self._allow_write:
            self.dbe.write_settings_project(project_state)
        return project_state
