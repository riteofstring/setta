import os
from collections import defaultdict
from pathlib import Path
from pprint import pprint

import yaml
from yaml.representer import Representer

from setta.code_gen.export_selected import (
    get_section_children,
    get_section_code,
    get_selected_item,
    get_selected_section_variant,
    get_section_name,
    get_section_variants,
    get_param_ids_given_selected_item
)
from setta.database.db.projects.load import load_full_project
from setta.utils.constants import C


def export_readable(dbs, filename):
    # export defaultdict the same way as dict
    yaml.add_representer(defaultdict, Representer.represent_dict)

    configs = load_full_project(dbs)
    # merge sectionConfigs into sections
    for c in configs:
        for k,v in c["sections"].items():
            c["sections"][k] = {**v, **c["sectionConfigs"][k]}

    root_folder = Path(f"{filename}_export")
    for c in configs:
        export_config(root_folder, c)



def export_config(folder, config):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["projectConfig"]["children"].keys():
        export_section(config_folder, config, k)


# TODO:
# each section variant gets its own file within that folder (filename is the variant name)
# children are put in subfolders: <variant-name>/<child name>

def export_section(folder, config, section_id):
    section_folder = folder / get_section_name(config, section_id)
    variants = get_section_variants(config, section_id)
    for v in variants:
        export_section_variant(section_folder, config, v)


    # for evColId in section["evColIds"]:
    #     export_evCol(
    #         section_folder,
    #         config,
    #         get_selected_item(config, section["id"]),
    #         get_selected_section_variant(config, section["id"]),
    #     )

    # code = get_section_code(config, section["id"])
    # if code:
    #     export_code(section_folder, code, section["codeLanguage"])

    # for c in get_section_children(config, section["id"]):
    #     export_section(section_folder, config, config["sections"][c])


def export_section_variant(folder, config, variant):
    output = defaultdict(dict)
    codeInfo = config["codeInfo"]
    for codeInfoId, valueInfo in variant["values"].items():
        value = valueInfo["value"]
        paramName = codeInfo[codeInfoId]["name"]
        parentName = get_parameter_parent(codeInfoId, codeInfo)
        if parentName:
            output[parentName][paramName] = value
        else:
            output[paramName] = value

    variant_name = variant["name"]

    if output:
        os.makedirs(folder, exist_ok=True)
        with open(folder / f"{variant_name}.yaml", "w") as file:
            yaml.dump(output, file, allow_unicode=True)



def get_parameter_parent(id, codeInfo):
    for c in codeInfo.values():
        if id in c["children"] and c["rcType"] == C.CALLABLE:
            return c["name"]

def export_code(folder, code, codeLanguage):
    filename = folder / "code"
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{filename}.{extension}", "w") as file:
        file.write(code)
