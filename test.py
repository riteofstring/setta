from pathlib import Path
from pprint import pprint

from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db_objs import DBE
from setta.database.settings_file import SettingsFile
from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.project_state.jsonSource import JSONSource
from setta.project_state.settings_project import create_settings_project_state
from setta.types.helpers_lvl3 import merge_single_config_into_backend
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import BaseDictSectionImpl


class DummyWMH:
    async def broadcast_notification(self, n):
        pass


wmh = DummyWMH()
dbe = DBE(Path("setta_files").resolve())

p = merge_single_config_into_backend(
    ProjectStateBackend(), create_settings_project_state(dbe.settings)
)
settings_file = SettingsFile(dbe, wmh)
sfw = SpecificFileWatcher()
js = JSONSource(wmh, settings_file, sfw, dbe)

file_contents = dbe.read_json(dbe.settings)
processedJson = js.process_json_object(
    file_contents,
    [
        s.jsonSourceKeys
        for s in p.sectionImpls.values()
        if isinstance(s, BaseDictSectionImpl)
    ],
)
pprint(processedJson.jsonSourceKeyToTopLevelIds)
# pprint(processedJson.hierarchy.name_path_to_descendant_ids)
# pprint(processedJson.model_dump())

load_json_sources_into_data_structures(
    p, {Path("setta_files/setta-settings.json").resolve(): processedJson}
)

# print("*" * 50)
# pprint(p.model_dump())

# dbe.write_json(Path("test.json"), {"dog": 5})
# load_json_sources_into_data_structures(p)
# print("*" * 50)
# pprint(p.model_dump())
