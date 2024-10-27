import os
from pathlib import Path

import yaml

from setta.code_gen.export_selected import (
    export_section_to_dict,
    get_param_ids,
    get_section_children,
    get_section_code,
    get_section_name,
    get_section_type,
    get_section_variants,
    get_selected_item_name,
)
from setta.utils.constants import C

from .utils import get_configs_and_root_folder


def export_readable(db, filename):
    configs, root_folder = get_configs_and_root_folder(db, filename)
    for c in configs:
        export_config(root_folder / "clean", c)


def export_config(folder, config):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["projectConfig"]["children"].keys():
        export_section(config_folder, config, k)


def export_section(folder, config, section_id):
    section_name = get_section_name(config, section_id)
    stype = get_section_type(config, section_id)
    if stype in [C.INTERACTIVE_CODE, C.CODE]:
        code = get_section_code(config, section_id)
        export_code(
            folder, section_name, code, config["sections"][section_id]["codeLanguage"]
        )
    elif stype in [C.SECTION, C.LIST_ROOT, C.DICT_ROOT, C.DECK]:
        output = get_section_as_dict(config, section_id)
        os.makedirs(folder, exist_ok=True)
        with open(folder / f"{section_name}.yaml", "w") as file:
            yaml.dump(output, file, allow_unicode=True)


def export_code(folder, name, code, codeLanguage):
    os.makedirs(folder, exist_ok=True)
    filename = folder / name
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{filename}.{extension}", "w") as file:
        file.write(code)


def get_section_as_dict(config, section_id):
    children = get_section_children(config, section_id)
    stype = get_section_type(config, section_id)
    if len(children) > 0:
        if stype == C.LIST_ROOT:
            return [get_section_as_dict(config, c) for c in children]
        elif stype in [C.DICT_ROOT, C.DECK]:
            return {
                get_section_name(config, c): get_section_as_dict(config, c)
                for c in children
            }
    else:
        selected_item_name = get_selected_item_name(config, section_id)
        param_ids = get_param_ids(config, section_id)
        param_dict = export_section_to_dict(config, section_id, param_ids).prettyOutput
        param_dict = {k: v for k, v in param_dict.items() if v}
        if selected_item_name:
            param_dict["_target_"] = selected_item_name
        return param_dict
