import os
from pathlib import Path

from setta.code_gen.export_selected import (
    export_section_to_dict,
    get_section_children,
    get_section_code,
    get_section_code_info_children,
    get_section_name,
    get_section_type,
    get_selected_item_id,
    get_selected_section_variant,
)
from setta.code_gen.yaml.section_dict import section_dict_to_yaml
from setta.utils.constants import C
from setta.utils.section_contents import get_param_ids_to_show_in_area

from .utils import get_configs_and_root_folder


def export_readable(db, filename):
    configs, root_folder = get_configs_and_root_folder(db, filename)
    for c in configs:
        export_config(root_folder / "clean", c)


def export_config(folder, config):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["projectConfig"]["children"].keys():
        os.makedirs(config_folder, exist_ok=True)
        export_section(config_folder, config, k)


def export_section(folder, config, section_id):
    section_name = get_section_name(config, section_id)
    stype = get_section_type(config, section_id)
    if stype in [C.INTERACTIVE_CODE, C.CODE]:
        code = get_section_code(config, section_id)
        export_code(
            folder, section_name, code, config["sections"][section_id]["codeLanguage"]
        )
    elif stype in [C.SECTION, C.GLOBAL_VARIABLES]:
        yamlValue = get_section_as_yaml(config, section_id)
        with open(folder / f"{section_name}.yaml", "w") as file:
            file.write(yamlValue)
    elif stype in [C.LIST_ROOT, C.DICT_ROOT, C.DECK]:
        children_folder = folder / section_name
        os.makedirs(children_folder, exist_ok=True)
        for c in get_section_children(config, section_id):
            export_section(children_folder, config, c)


def export_code(folder, name, code, codeLanguage):
    filename = folder / name
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{filename}.{extension}", "w") as file:
        file.write(code)


def get_section_as_yaml(config, section_id):
    codeInfoChildren = get_section_code_info_children(config, section_id)
    sectionVariant = get_selected_section_variant(config, section_id)
    pinned = get_param_ids_to_show_in_area(
        True,
        config["codeInfo"],
        codeInfoChildren,
        get_selected_item_id(config, section_id),
    )
    unpinned = get_param_ids_to_show_in_area(
        False,
        config["codeInfo"],
        codeInfoChildren,
        get_selected_item_id(config, section_id),
    )
    pinned["requiredParamIds"] = pinned["requiredParamIdsToPaths"].keys()
    unpinned["requiredParamIds"] = unpinned["requiredParamIdsToPaths"].keys()
    del pinned["requiredParamIdsToPaths"]
    del unpinned["requiredParamIdsToPaths"]

    output = export_section_to_dict(
        config["codeInfo"],
        codeInfoChildren,
        sectionVariant,
        {"pinned": pinned, "unpinned": unpinned},
        config["sections"][section_id]["configLanguage"],
    )
    return section_dict_to_yaml(output, config["codeInfo"], sectionVariant)
