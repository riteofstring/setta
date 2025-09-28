from pathlib import Path

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.artifacts import Artifacts
from setta.project_state.jsonSource import JSONSource
from setta.types.generated.impl_args_as_typed_dicts import DictSectionImplArgs
from setta.types.helpers_lvl2 import (
    create_top_level_section,
    set_section_variant_name,
)
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import SectionType
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
js = JSONSource(wmh, settings_file, sfw, dbe)
sectionId = create_top_level_section(
    settings_file.settings,
    artifacts,
    p,
    SectionType.Dict,
    Position(),
    DictSectionImplArgs(isJsonSource=True),
)
set_section_variant_name(p, p.sections[sectionId].defaultVariant, "test.json")

file_contents = dbe.read_json(Path("test.json"))
processedJson = js.process_json_object(file_contents, set([()]))
load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})

sectionId = create_top_level_section(
    settings_file.settings,
    artifacts,
    p,
    SectionType.Dict,
    Position(),
    DictSectionImplArgs(isJsonSource=True),
)
set_section_variant_name(p, p.sections[sectionId].defaultVariant, "test.json")
file_contents = dbe.read_json(Path("test.json"))
processedJson = js.process_json_object(file_contents, set([()]))
load_json_sources_into_data_structures(p, {Path("test.json").resolve(): processedJson})

# pprint(p.model_dump())
