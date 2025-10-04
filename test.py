from pathlib import Path
from pprint import pprint

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db.jsonSource.save import save_json_source_data
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource import JSONSource
from setta.project_state.settings_project import create_settings_project_state
from setta.types.generated.impl_args_as_typed_dicts import DictSectionImplArgs
from setta.types.helpers_lvl2 import create_top_level_section, set_section_variant_name
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.simplified_states import Position


class DummyWMH:
    async def broadcast_notification(self, n):
        pass


wmh = DummyWMH()
dbe = DBE(Path("setta_files").resolve())

json_file_name = Path("setta_files/setta-settings.json")
json_file_name.unlink()
# json_file_name = Path("test.json")

p1 = create_settings_project_state(dbe.settings)
dbe.write_settings_project(p1)
# p1 = merge_single_config_into_backend(ProjectStateBackend(), p1)

p = ProjectStateSingleConfig(projectConfig=ProjectConfig())
settings_file = SettingsFile(dbe, wmh)
sfw = SpecificFileWatcher()
artifacts = Artifacts(wmh, sfw, dbe)
js = JSONSource(wmh, settings_file, sfw, dbe)
sectionId = create_top_level_section(
    settings_file.settings,
    artifacts,
    p,
    SectionType.Dict,
    Position(),
    DictSectionImplArgs(isJsonSource=True),
)
set_section_variant_name(p, p.sections[sectionId].defaultVariant, str(json_file_name))
p = merge_single_config_into_backend(ProjectStateBackend(), p)

file_contents = dbe.read_json(json_file_name)
processedJson = js.process_json_object(file_contents)
sectionVariantsToLoad: set[tuple[str, str]] = set()
for s in p.sections.values():
    for v in s.variants:
        sectionVariantsToLoad.add((s.id, v))

load_json_sources_into_data_structures(
    p, {json_file_name.resolve(): processedJson}, sectionVariantsToLoad
)
print("*********project state********")
pprint(p.model_dump())
convert_backend_to_single_config(p, list(p.projectConfigs.keys())[0])
save_json_source_data(dbe, p)


p2 = create_settings_project_state(dbe.settings)
p2 = merge_single_config_into_backend(ProjectStateBackend(), p2)
file_contents = dbe.read_json(json_file_name)
processedJson = js.process_json_object(file_contents)
sectionVariantsToLoad: set[tuple[str, str]] = set()
for s in p2.sections.values():
    for v in s.variants:
        sectionVariantsToLoad.add((s.id, v))

load_json_sources_into_data_structures(
    p2, {json_file_name.resolve(): processedJson}, sectionVariantsToLoad
)
convert_backend_to_single_config(p2, list(p2.projectConfigs.keys())[0])


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
