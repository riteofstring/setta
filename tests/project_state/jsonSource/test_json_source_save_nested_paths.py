import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.project_state.jsonSource.save import save_json_source_data
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseChildlessCodeObjImplArgsWithCallable,
    BaseDictSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
    get_variant_base_and_effective_code_obj_impl,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import create_top_level_section, get_top_level_param_ids
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, ConfigLanguage, SectionType
from setta.utils.structured_data import read_json_source_payload, write_json_source_payload
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class JsonSourceSaveNestedPathsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)

        root = Path(self._tmpdir.name)
        self.dbe = DBE(root)
        websocket_manager = WebsocketManager()
        frontend_sender = WMHFrontendSender(websocket_manager)
        self.settings_file = SettingsFile(self.dbe, frontend_sender)
        self.specific_file_watcher = SpecificFileWatcher()
        self.json_source = JSONSource(
            frontend_sender,
            self.settings_file,
            self.specific_file_watcher,
            self.dbe,
        )

        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="json-source-save")
        )

    def _create_json_source_section(self, json_source_keys: list[str], filename: Path):
        section_id = create_top_level_section(
            self.settings_file.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        set_curr_effective_section_impl_value(
            self.project_state,
            section_id,
            BaseDictSectionImplArgsWithCallable(
                isJsonSource=True,
                jsonSourceKeys=json_source_keys,
                configLanguage=ConfigLanguage.json,
            ),
        )
        variant = get_curr_section_variant(self.project_state, section_id)
        variant.name = str(filename)
        return section_id, variant.id

    def test_save_preserves_unrelated_keys(self) -> None:
        payload = {
            "app": {"name": "Setta Demo", "version": "1.2.3"},
            "features": {
                "flags": {"newUI": True, "betaMode": False},
                "rollouts": {"search": {"percentage": 25}},
            },
            "paths": {"root": "/opt/app", "data": "/var/lib/app/data"},
        }
        filename = normalize_path(Path(self._tmpdir.name) / "sample.json")
        write_json_source_payload(filename, payload, self.dbe)

        section_id, variant_id = self._create_json_source_section(
            ["features", "flags"], filename
        )
        processed = self.json_source.process_json_object(payload)
        json_sources = {filename: processed}
        load_json_sources_into_data_structures(
            self.project_state, json_sources, [(section_id, variant_id)]
        )

        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_id, BaseDictSectionImpl
        )
        hierarchy = traverse_hierarchy(
            self.project_state.codeObjs,
            self.project_state.codeObjImpls,
            self.project_state.codeObjVariants,
            impl.codeObjVariantMap,
            get_top_level_param_ids(self.project_state, impl),
            options=TraversalOptions(
                build_id_to_name_path=True,
                build_name_path_to_id=True,
                name_path_prefix=tuple(impl.jsonSourceKeys),
            ),
        )
        beta_mode_id = hierarchy.name_path_to_id[
            ("features", "flags", "betaMode")
        ]
        beta_mode_variant_id = impl.codeObjVariantMap[beta_mode_id]
        beta_mode_core = self.project_state.codeObjs[beta_mode_id]
        beta_variant, beta_base_impl, _ = get_variant_base_and_effective_code_obj_impl(
            self.project_state, beta_mode_core, beta_mode_variant_id
        )
        self.assertIsInstance(beta_base_impl, BaseChildlessCodeObjImpl)
        set_effective_impl_value(
            beta_base_impl,
            beta_mode_core,
            beta_variant,
            BaseChildlessCodeObjImplArgsWithCallable(value=json.dumps(True)),
        )

        save_json_source_data(self.dbe, self.project_state)
        updated = read_json_source_payload(filename, self.dbe)

        self.assertIn("app", updated)
        self.assertIn("paths", updated)
        self.assertIn("rollouts", updated["features"])
        self.assertTrue(updated["features"]["flags"]["betaMode"])
