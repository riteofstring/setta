import os
from collections import defaultdict
from pathlib import Path

import yaml
from yaml.representer import Representer

from setta.code_gen.export_selected import get_section_name, get_section_variants
from setta.database.db.projects.load import load_full_project
from setta.utils.constants import C


def export_readable(dbs, filename):
    # export defaultdict the same way as dict
    yaml.add_representer(defaultdict, Representer.represent_dict)

    configs = load_full_project(dbs)
    # merge sectionConfigs into sections
    for c in configs:
        for k, v in c["sections"].items():
            c["sections"][k] = {**v, **c["sectionConfigs"][k]}

    root_folder = Path(f"{filename}_export")
    for c in configs:
        export_config(root_folder, c)


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
            yaml.dump(output, file, allow_unicode=True)

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
        return [config["sections"][c]["name"] for c in variant["children"]]

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

    return output


def get_parameter_ancestors(id, codeInfo, ancestors):
    for c in codeInfo.values():
        if id in c["children"] and c["rcType"] != C.COLLECTION:
            ancestors.append(c["name"])
            get_parameter_ancestors(c["id"], codeInfo, ancestors)
    return ancestors


def export_code(folder, variant_name, code, codeLanguage):
    filename = folder / variant_name
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{filename}.{extension}", "w") as file:
        file.write(code)
