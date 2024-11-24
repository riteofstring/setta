import json
from setta.code_gen.export_selected import export_single_run_group_to_dict
import yaml

with open("seed/examples/sklearn_example/sklearn_example.json", 'r') as f:
    data = json.load(f)


for id, runGroup in data["runGroups"].items():
    exporter_obj = export_single_run_group_to_dict(runGroup["sections"], data["sections"], data["sectionVariants"], data["paramSweeps"])



print(yaml.dump(exporter_obj.prettyOutput))