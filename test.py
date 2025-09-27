from pathlib import Path
from pprint import pprint
from setta.database.db.jsonSource.load import load_json_sources_into_data_structures
from setta.database.db_objs import DBE
from setta.types.generated.settings_state import SettingsState
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import DictSectionImpl


dbe = DBE(Path("setta_files"))
p = dbe.read_project()
settings_state = SettingsState()
dbe.write_json(Path("test.json"), {"dog": 5, "cat": 7})
load_json_sources_into_data_structures(dbe, settings_state, p)

print("*"*50)
pprint(p.model_dump())

dbe.write_json(Path("test.json"), {"dog": 5})
load_json_sources_into_data_structures(dbe, settings_state, p)
print("*"*50)
pprint(p.model_dump())