from pathlib import Path
from pprint import pprint

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource import JSONSource
from setta.project_state.settings_project import create_settings_project_state
from setta.types.generated.impl_args_as_typed_dicts import DictSectionImplArgs
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl
from setta.types.helpers_lvl2 import (
    create_section,
    create_top_level_section,
    set_section_variant_name,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl, SectionType
from setta.types.core import Core, Variant
from setta.types.project_config import ProjectConfig
from setta.types.simplified_states import Position


class DummyWMH:
    async def broadcast_notification(self, n):
        pass


wmh = DummyWMH()
dbe = DBE(Path("setta_files").resolve())

# p = merge_single_config_into_backend(
#     ProjectStateBackend(), create_settings_project_state(dbe.settings)
# )
p = ProjectStateSingleConfig(projectConfig=ProjectConfig())
settings_file = SettingsFile(dbe, wmh)
sfw = SpecificFileWatcher()
artifacts = Artifacts(wmh, sfw, dbe)
sectionId = create_top_level_section(
    settings_file.settings,
    artifacts,
    p,
    SectionType.Dict,
    Position(),
    DictSectionImplArgs(isJsonSource=True),
)
set_section_variant_name(p, p.sections[sectionId].defaultVariant, "test.json")


js = JSONSource(wmh, settings_file, sfw, dbe)

file_contents = dbe.read_json(Path("test.json"))
print("\n\n\n\n\n******************processing json object")
processedJson = js.process_json_object(file_contents, set([()]))
# pprint(processedJson.jsonSourceKeyToTopLevelIds)
# pprint(processedJson.hierarchy.name_path_to_descendant_ids)
# pprint(processedJson.keyValueInfo)
# pprint(processedJson.model_dump())

load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})
pprint(p.model_dump())

# for s in p.sections.values():
#     if s.name == "gui":
#         sectionId = s.id

# for c in p.codeObjs.values():
#     if c.name == "gridColor":
#         codeObjId = c.id


# singleP = convert_backend_to_single_config(p, list(p.projectConfigs.keys())[0])
# impl = get_curr_effective_code_obj_impl(singleP, sectionId, codeObjId)
# core = singleP.codeObjs[codeObjId]
# variant = singleP.codeObjVariants[core.variants[0]]

# pprint(impl.model_dump())
# pprint(core.model_dump())
# pprint(variant.model_dump())

# print("*" * 50)
# pprint(p.model_dump())

# dbe.write_json(Path("test.json"), {"dog": 5})
# load_json_sources_into_data_structures(p)
# print("*" * 50)
# pprint(p.model_dump())
