import os
from pathlib import Path

from setta.code_gen.export_selected import (
    export_section_to_dict,
    get_section_children,
    get_section_code_info_children,
    get_section_name,
    get_selected_section_variant_id,
    get_section_type,
    get_section_variant_ids,
    get_selected_item_id,
    get_selected_section_variant,
    get_variant_code,
    get_variant_name,
)
from setta.code_gen.yaml.section_dict import section_dict_to_yaml
from setta.utils.constants import C
from setta.utils.section_contents import get_param_ids_to_show_in_area

from .utils import get_configs_and_root_folder


def export_readable(db, filename, with_variants):
    configs, root_folder = get_configs_and_root_folder(db, filename)
    subfolder_name = "with_variants" if with_variants else "clean"
    for c in configs:
        export_config(root_folder / subfolder_name, c, with_variants)


def export_config(folder, config, with_variants):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["projectConfig"]["children"].keys():
        os.makedirs(config_folder, exist_ok=True)
        export_section(config_folder, config, k, with_variants)


def export_section(folder, config, section_id, with_variants):
    stype = get_section_type(config, section_id)
    variant_ids = (
        get_section_variant_ids(config, section_id)
        if with_variants
        else [get_selected_section_variant_id(config, section_id)]
    )
    for variant_id in variant_ids:
        if stype in [C.INTERACTIVE_CODE, C.CODE]:
            export_code(folder, config, section_id, variant_id, with_variants)
        # elif stype in [C.SECTION, C.GLOBAL_VARIABLES]:
        #     export_regular_section(folder, config, section_id, with_variants)
        # elif stype in [C.LIST_ROOT, C.DICT_ROOT, C.DECK]:
        #     export_list_section(folder, config, section_id, with_variants)


def export_code(folder, config, section_id, variant_id, with_variants):
    codeLanguage = config["sections"][section_id]["codeLanguage"]
    code = get_variant_code(config, variant_id)
    section_name = get_section_name(config, section_id)
    variant_name = get_variant_name(config, variant_id)
    base = maybe_with_variant_in_filename(section_name, variant_name, with_variants)
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{folder / base}.{extension}", "w") as file:
        file.write(code)


def export_regular_section(folder, config, section_id, with_variants):
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
    yamlValue = section_dict_to_yaml(output, config["codeInfo"], sectionVariant)
    section_name = get_section_name(config, section_id)
    with open(folder / f"{section_name}.yaml", "w") as file:
        file.write(yamlValue)


def export_list_section(folder, config, section_id, with_variants):
    section_name = get_section_name(config, section_id)
    children_folder = folder / section_name
    os.makedirs(children_folder, exist_ok=True)
    for c in get_section_children(config, section_id):
        export_section(children_folder, config, c, with_variants)


def maybe_with_variant_in_filename(section_name, variant_name, with_variants):
    if with_variants:
        return f"{section_name}@{variant_name}"
    return section_name
