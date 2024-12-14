import json
from setta.code_gen.export_selected import export_single_run_group_to_dict
from setta.code_gen.yaml.section_dict import param_sweep_dict_to_yaml, run_group_dict_to_yaml
import yaml

with open("seed/examples/diffusionDrops/diffusionDrops2.json", 'r') as f:
    data = json.load(f)


for id, runGroup in data["runGroups"].items():
    exporter_obj = export_single_run_group_to_dict(runGroup["sections"], data["sections"], data["sectionVariants"], data["paramSweeps"])

    print(run_group_dict_to_yaml(exporter_obj))