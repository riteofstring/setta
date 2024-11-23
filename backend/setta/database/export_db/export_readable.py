import os
import shutil
from pathlib import Path

from setta.code_gen.export_selected import (
    export_param_sweep_section_to_dict,
    export_section_to_dict,
    get_for_section_id,
    get_section_name,
    get_section_type,
    get_section_variant_ids,
    get_selected_section_variant,
    get_selected_section_variant_id,
    get_variant_code,
    get_variant_name,
)
from setta.code_gen.yaml.section_dict import (
    param_sweep_dict_to_yaml,
    section_dict_to_yaml,
)
from setta.utils.constants import C
from setta.utils.section_contents import get_param_ids_to_show_in_area

from .utils import get_configs_and_root_folder


def export_readable(db, filename, with_variants):
    configs, root_folder = get_configs_and_root_folder(db, filename)
    subfolder_name = "with_variants" if with_variants else "clean"
    root_folder = root_folder / subfolder_name
    try:
        print("try deleting:", root_folder)
        shutil.rmtree(root_folder)
    except:
        pass

    print("exporting readable to", root_folder)

    for c in configs:
        export_config(root_folder, c, with_variants)


def export_config(folder, config, with_variants):
    config_folder = Path(folder) / config["projectConfig"]["name"]
    for k in config["projectConfig"]["children"].keys():
        os.makedirs(config_folder, exist_ok=True)
        export_section(config_folder, config, k, with_variants)


def export_section(folder, config, section_id, with_variants):
    exporter_fn = get_exporter_fn(config, section_id)
    if not exporter_fn:
        return
    variant_ids = get_variant_ids(config, section_id, with_variants)
    print("section_id", section_id)
    print("variant_ids", variant_ids)
    for variant_id in variant_ids:
        if not variant_id:
            continue
        exporter_fn(folder, config, section_id, variant_id, with_variants)


def export_code(folder, config, section_id, variant_id, with_variants):
    codeLanguage = config["sections"][section_id]["codeLanguage"]
    code = get_variant_code(config, variant_id)
    base = maybe_with_variant_in_filename(config, section_id, variant_id, with_variants)
    extension = {"javascript": "js", "python": "py", "bash": "sh"}[codeLanguage]
    with open(f"{folder / base}.{extension}", "w") as file:
        file.write(code)


def export_regular_section(folder, config, section_id, variant_id, with_variants):
    sectionVariant = config["sectionVariants"][variant_id]
    selectedItemId = sectionVariant["selectedItem"]
    codeInfoChildren = config["codeInfoCols"][sectionVariant["codeInfoColId"]][
        "children"
    ]
    pinned = get_param_ids_to_show_in_area(
        True,
        config["codeInfo"],
        codeInfoChildren,
        selectedItemId,
    )
    unpinned = get_param_ids_to_show_in_area(
        False,
        config["codeInfo"],
        codeInfoChildren,
        selectedItemId,
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
    base = maybe_with_variant_in_filename(config, section_id, variant_id, with_variants)

    with open(folder / f"{base}.yaml", "w") as file:
        file.write(yamlValue)


def export_list_section(folder, config, section_id, variant_id, with_variants):
    subfolder_name = maybe_with_variant_in_filename(
        config, section_id, variant_id, with_variants
    )
    children_folder = folder / subfolder_name
    os.makedirs(children_folder, exist_ok=True)
    for c in config["sectionVariants"][variant_id]["children"]:
        export_section(children_folder, config, c, with_variants)


def export_info_section(folder, config, section_id, variant_id, with_variants):
    base = maybe_with_variant_in_filename(config, section_id, variant_id, with_variants)
    section = config["sections"][section_id]
    info = section["description"]
    renderMarkdown = section["renderMarkdown"]
    extension = ".md" if renderMarkdown else ".txt"
    with open(folder / f"{base}{extension}", "w") as file:
        file.write(info)


def export_param_sweep_section(
    folder, config, section_id, param_sweep_id, with_variants
):
    for_section_id = get_for_section_id(config, section_id)
    if not for_section_id:
        return

    sectionVariant = get_selected_section_variant(config, for_section_id)
    codeInfoChildren = config["codeInfoCols"][sectionVariant["codeInfoColId"]][
        "children"
    ]
    sweep = config["paramSweeps"][param_sweep_id]["sweep"]
    e = export_param_sweep_section_to_dict(sweep, config["codeInfo"], codeInfoChildren)
    yamlValue = param_sweep_dict_to_yaml(e)
    base = maybe_with_param_sweep_in_filename(
        config, section_id, param_sweep_id, with_variants
    )
    with open(folder / f"{base}.yaml", "w") as file:
        file.write(yamlValue)


def maybe_with_variant_in_filename(config, section_id, variant_id, with_variants):
    section_name = get_section_name(config, section_id)
    variant_name = get_variant_name(config, variant_id)
    if with_variants:
        return f"{section_name}@{variant_name}"
    return section_name


def maybe_with_param_sweep_in_filename(
    config, section_id, param_sweep_id, with_variants
):
    section_name = get_section_name(config, section_id)
    param_sweep_name = config["paramSweeps"][param_sweep_id]["name"]
    if with_variants:
        return f"{section_name}@{param_sweep_name}"
    return section_name


def get_exporter_fn(config, section_id):
    stype = get_section_type(config, section_id)
    if stype in [C.INTERACTIVE_CODE, C.CODE]:
        return export_code
    elif stype in [C.SECTION, C.GLOBAL_VARIABLES]:
        return export_regular_section
    elif stype in [C.LIST_ROOT, C.DICT_ROOT, C.DECK]:
        return export_list_section
    elif stype == C.INFO:
        return export_info_section
    elif stype == C.PARAM_SWEEP:
        return export_param_sweep_section


def get_variant_ids(config, section_id, with_variants):
    stype = get_section_type(config, section_id)
    if stype == C.PARAM_SWEEP:
        for_section_id = get_for_section_id(config, section_id)
        return (
            config["sections"][for_section_id]["paramSweepIds"]
            if with_variants
            else [config["sections"][for_section_id]["paramSweepId"]]
        )
    else:
        return (
            get_section_variant_ids(config, section_id)
            if with_variants
            else [get_selected_section_variant_id(config, section_id)]
        )
