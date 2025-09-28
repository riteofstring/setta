from pathlib import Path

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource import JSONSource
from setta.project_state.settings_project import create_settings_project_state
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import BaseDictSectionImpl


class DummyWMH:
    async def broadcast_notification(self, n):
        pass


wmh = DummyWMH()
dbe = DBE(Path("setta_files").resolve())

json_file_name = Path("setta_files/setta-settings.json")
# json_file_name = Path("test.json")

p = create_settings_project_state(dbe.settings)
dbe.write_settings_project(p)
p = merge_single_config_into_backend(ProjectStateBackend(), p)

# p = ProjectStateSingleConfig(projectConfig=ProjectConfig())
settings_file = SettingsFile(dbe, wmh)
sfw = SpecificFileWatcher()
artifacts = Artifacts(wmh, sfw, dbe)
js = JSONSource(wmh, settings_file, sfw, dbe)
# sectionId = create_top_level_section(
#     settings_file.settings,
#     artifacts,
#     p,
#     SectionType.Dict,
#     Position(),
#     DictSectionImplArgs(isJsonSource=True),
# )
# set_section_variant_name(p, p.sections[sectionId].defaultVariant, str(json_file_name))
# p = merge_single_config_into_backend(ProjectStateBackend(), p)

# dbe.write_json(json_file_name, {"dog": 5})
file_contents = dbe.read_json(json_file_name)
processedJson = js.process_json_object(
    file_contents,
    set(
        [
            tuple(s.jsonSourceKeys)
            for s in p.sectionImpls.values()
            if isinstance(s, BaseDictSectionImpl)
        ]
    ),
)
# for c in processedJson.keyValueInfo.codeObjs.values():
#     pprint(c.model_dump())
# print("********processedJson.hierarchy********")
# pprint(processedJson.hierarchy.name_path_to_id)
# pprint(processedJson.hierarchy.name_path_to_descendant_ids)
load_json_sources_into_data_structures(p, {json_file_name.resolve(): processedJson})
# print("*********project state********")
# pprint(p.model_dump())
# ProjectStateSingleConfig(**p.model_dump())
convert_backend_to_single_config(p, list(p.projectConfigs.keys())[0])

# dbe.write_json(json_file_name, {"dog": {"cat": 5}})
# file_contents = dbe.read_json(json_file_name)
# processedJson = js.process_json_object(
#     file_contents,
#     set(
#         [
#             tuple(s.jsonSourceKeys)
#             for s in p.sectionImpls.values()
#             if isinstance(s, BaseDictSectionImpl)
#         ]
#     ),
# )
# load_json_sources_into_data_structures(p, {json_file_name.resolve(): processedJson})


# dbe.write_json(json_file_name, {"dog": 5})
# file_contents = dbe.read_json(json_file_name)
# processedJson = js.process_json_object(
#     file_contents,
#     set(
#         [
#             tuple(s.jsonSourceKeys)
#             for s in p.sectionImpls.values()
#             if isinstance(s, BaseDictSectionImpl)
#         ]
#     ),
# )
# load_json_sources_into_data_structures(p, {json_file_name.resolve(): processedJson})


# print("*********project state********")
# pprint(p.model_dump())

# load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})
# print("*********project state********")
# pprint(p.model_dump())

# sectionId = create_top_level_section(
#     settings_file.settings,
#     artifacts,
#     p,
#     SectionType.Dict,
#     Position(),
#     DictSectionImplArgs(isJsonSource=True),
# )
# set_section_variant_name(p, p.sections[sectionId].defaultVariant, "test.json")
# file_contents = dbe.read_json(Path("test.json"))
# processedJson = js.process_json_object(file_contents, set([()]))
# load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})

# print("*********project state********")
# pprint(p.model_dump())
