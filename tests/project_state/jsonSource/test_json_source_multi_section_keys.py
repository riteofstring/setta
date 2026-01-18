import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.jsonSource.jsonSource import JSONSource
from setta.project_state.jsonSource.load import load_json_sources_into_data_structures
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl_with_type_guard,
    get_curr_section_variant,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import create_top_level_section
from setta.types.helpers_lvl3 import convert_backend_to_single_config
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, ConfigLanguage, SectionType
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


class JsonSourceMultiSectionKeysTests(unittest.TestCase):
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
            projectConfig=ProjectConfig(name="json-source-multi")
        )

    def _create_json_source_section(self, json_source_keys: list[str]):
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
        variant.name = "sample.json"
        return section_id, variant.id

    def _assert_backend_roundtrip(self) -> None:
        backend = ProjectStateBackend(
            sections=self.project_state.sections,
            sectionImpls=self.project_state.sectionImpls,
            sectionVariants=self.project_state.sectionVariants,
            codeObjs=self.project_state.codeObjs,
            codeObjImpls=self.project_state.codeObjImpls,
            codeObjVariants=self.project_state.codeObjVariants,
            projectConfigs={
                self.project_state.projectConfig.id: self.project_state.projectConfig
            },
            defaultProjectConfigId=self.project_state.projectConfig.id,
        )
        convert_backend_to_single_config(backend, self.project_state.projectConfig.id)

    def _get_section_code_obj_ids(self, section_id: str) -> set[str]:
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_id, BaseDictSectionImpl
        )
        return set(impl.codeObjVariantMap.keys())

    def _assert_section_code_objs_exist(self, section_id: str) -> None:
        for code_obj_id in self._get_section_code_obj_ids(section_id):
            self.assertIn(code_obj_id, self.project_state.codeObjs)

    def test_sections_with_shared_json_source_keep_distinct_code_objs(self) -> None:
        section_a, variant_a = self._create_json_source_section(["alpha"])
        section_b, variant_b = self._create_json_source_section(["beta", "inner"])

        processed = self.json_source.process_json_object(
            {
                "alpha": {"one": 1, "two": 2},
                "beta": {"inner": {"three": 3}},
            }
        )
        json_sources = {normalize_path("sample.json"): processed}

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources,
            [(section_a, variant_a), (section_b, variant_b)],
        )
        self._assert_section_code_objs_exist(section_a)
        self._assert_section_code_objs_exist(section_b)

        ids_a = self._get_section_code_obj_ids(section_a)
        ids_b = self._get_section_code_obj_ids(section_b)
        self.assertTrue(ids_a.isdisjoint(ids_b))
        self._assert_backend_roundtrip()

        set_curr_effective_section_impl_value(
            self.project_state,
            section_a,
            BaseDictSectionImplArgsWithCallable(
                jsonSourceKeys=["beta"],
            ),
        )

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources,
            [(section_a, variant_a)],
        )
        self._assert_section_code_objs_exist(section_a)
        self._assert_section_code_objs_exist(section_b)
        self._assert_backend_roundtrip()

    def test_missing_json_source_path_marks_missing(self) -> None:
        section_id, variant_id = self._create_json_source_section(["missing"])

        processed = self.json_source.process_json_object({"alpha": {"one": 1}})
        json_sources = {normalize_path("sample.json"): processed}

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources,
            [(section_id, variant_id)],
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_id, BaseDictSectionImpl
        )
        self.assertTrue(impl.jsonSourceMissing)

    def test_json_source_leaf_path_marks_missing(self) -> None:
        section_id, variant_id = self._create_json_source_section(["alpha", "one"])

        processed = self.json_source.process_json_object({"alpha": {"one": 1}})
        json_sources = {normalize_path("sample.json"): processed}

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources,
            [(section_id, variant_id)],
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_id, BaseDictSectionImpl
        )
        self.assertTrue(impl.jsonSourceMissing)

    def test_unrequested_shared_variant_is_not_updated(self) -> None:
        section_a, variant_a = self._create_json_source_section(["alpha"])
        section_b, variant_b = self._create_json_source_section(["alpha"])

        processed = self.json_source.process_json_object({"alpha": {"one": 1}})
        json_sources = {normalize_path("sample.json"): processed}

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources,
            [(section_a, variant_a), (section_b, variant_b)],
        )

        impl_a = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_a, BaseDictSectionImpl
        )
        impl_b = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_b, BaseDictSectionImpl
        )
        prev_a_map = dict(impl_a.codeObjVariantMap)
        prev_b_map = dict(impl_b.codeObjVariantMap)
        prev_b_top_level = impl_b.topLevelParamId

        processed_next = self.json_source.process_json_object(
            {"alpha": {"one": 1, "two": 2}}
        )
        json_sources_next = {normalize_path("sample.json"): processed_next}

        load_json_sources_into_data_structures(
            self.project_state,
            json_sources_next,
            [(section_a, variant_a)],
        )

        impl_a_updated = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_a, BaseDictSectionImpl
        )
        impl_b_updated = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_b, BaseDictSectionImpl
        )

        self.assertGreater(len(impl_a_updated.codeObjVariantMap), len(prev_a_map))
        self.assertEqual(prev_b_map, impl_b_updated.codeObjVariantMap)
        self.assertEqual(prev_b_top_level, impl_b_updated.topLevelParamId)
        for code_obj_id in prev_b_map.keys():
            self.assertIn(code_obj_id, self.project_state.codeObjs)

    def test_unrequested_shared_variant_marks_missing(self) -> None:
        section_a, variant_a = self._create_json_source_section(["alpha"])
        section_b, _ = self._create_json_source_section(["alpha"])

        impl_a = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_a, BaseDictSectionImpl
        )
        impl_b = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_b, BaseDictSectionImpl
        )
        self.assertFalse(impl_a.jsonSourceMissing)
        self.assertFalse(impl_b.jsonSourceMissing)

        load_json_sources_into_data_structures(
            self.project_state,
            {},
            [(section_a, variant_a)],
        )

        impl_a_after = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_a, BaseDictSectionImpl
        )
        impl_b_after = get_curr_effective_section_impl_with_type_guard(
            self.project_state, section_b, BaseDictSectionImpl
        )
        self.assertTrue(impl_a_after.jsonSourceMissing)
        self.assertTrue(impl_b_after.jsonSourceMissing)
