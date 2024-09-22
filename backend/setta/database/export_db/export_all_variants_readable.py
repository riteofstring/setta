import os
from pathlib import Path

import yaml

from setta.code_gen.export_selected import get_section_name, get_section_variants
from setta.utils.constants import C

from .export_readable import export_code
from .utils import get_configs_and_root_folder


def export_all_variants_readable(dbs, filename):
    configs, root_folder = get_configs_and_root_folder(dbs, filename)
    for c in configs:
        export_config(root_folder / "allVariants", c)


def export_config(folder, config):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["sections"].keys():
        export_section(config_folder, config, k)


def export_section(folder, config, section_id):
    section_folder = folder / get_section_name(config, section_id)
    variants = get_section_variants(config, section_id)
    for v in variants:
        export_section_variant(section_folder, config, section_id, v)


def export_section_variant(folder, config, section_id, variant):
    output = get_section_variant_representation(config, variant)
    variant_name = variant["name"]
    if output:
        os.makedirs(folder, exist_ok=True)
        with open(folder / f"{variant_name}.yaml", "w") as file:
            yaml.dump_all(output, file, allow_unicode=True)

    if variant["code"]:
        os.makedirs(folder, exist_ok=True)
        export_code(
            folder,
            variant_name,
            variant["code"],
            config["sections"][section_id]["codeLanguage"],
        )


def get_section_variant_representation(config, variant):
    if len(variant["children"]) > 0:
        metadata = {
            "children": [config["sections"][c]["name"] for c in variant["children"]]
        }
        return [metadata, {}]

    output = {}
    codeInfo = config["codeInfo"]
    for codeInfoId, valueInfo in variant["values"].items():
        value = valueInfo["value"]
        paramName = codeInfo[codeInfoId]["name"]
        ancestor_names = get_parameter_ancestors(codeInfoId, codeInfo, [])
        curr_dict = output
        for name in ancestor_names[::-1]:
            if name not in curr_dict:
                curr_dict[name] = {}
            curr_dict = curr_dict[name]
        if isinstance(curr_dict.get(paramName), dict):
            continue
        curr_dict[paramName] = value

    selectedItem = variant["selectedItem"]
    metadata = {
        "selectedItem": codeInfo[selectedItem]["name"] if selectedItem else None
    }

    return [metadata, output]


def get_parameter_ancestors(id, codeInfo, ancestors):
    for c in codeInfo.values():
        if id in c["children"] and c["rcType"] != C.COLLECTION:
            ancestors.append(c["name"])
            get_parameter_ancestors(c["id"], codeInfo, ancestors)
    return ancestors
