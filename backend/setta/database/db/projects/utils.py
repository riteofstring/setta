import copy

from setta.database.db.codeInfo.utils import (
    add_defaults_to_code_info,
    add_defaults_to_code_info_cols,
)
from setta.database.db.sections.utils import add_defaults_to_sections
from setta.database.db.sectionVariants.utils import add_defaults_to_section_variants
from setta.database.db.uiTypes.utils import add_defaults_to_ui_type_cols
from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import deep_merge, filter_dict


def with_project_config_defaults(**kwargs):
    return deep_merge(copy.deepcopy(DEFAULT_VALUES["projectConfig"]), kwargs)


def add_defaults_to_project(p):
    p["projectConfig"] = with_project_config_defaults(**p["projectConfig"])
    add_defaults_to_sections(p["sections"])
    add_defaults_to_section_variants(p["sectionVariants"])
    add_defaults_to_code_info(p["codeInfo"])
    add_defaults_to_code_info_cols(p["codeInfoCols"])
    add_defaults_to_ui_type_cols(p["uiTypeCols"])


def remove_empty(x):
    return {k: v for k, v in x.items() if len(v) > 0}


def filter_data_for_json_export(p):
    p["projectConfig"] = filter_dict(
        p["projectConfig"],
        DEFAULT_VALUES["projectConfig"].keys(),
        DEFAULT_VALUES["projectConfig"],
    )

    for k, v in p["codeInfo"].items():
        p["codeInfo"][k] = filter_dict(
            v, DEFAULT_VALUES["codeInfo"].keys(), DEFAULT_VALUES["codeInfo"]
        )

    for k, v in p["codeInfoCols"].items():
        p["codeInfoCols"][k] = filter_dict(
            v, DEFAULT_VALUES["codeInfoCol"].keys(), DEFAULT_VALUES["codeInfoCol"]
        )
    p["codeInfoCols"] = remove_empty(p["codeInfoCols"])

    for k, v in p["uiTypeCols"].items():
        for paramId, uiTypeColInfo in v.items():
            p["uiTypeCols"][k][paramId] = filter_dict(
                uiTypeColInfo,
                DEFAULT_VALUES["uiTypeColEntry"].keys(),
                DEFAULT_VALUES["uiTypeColEntry"],
            )

        p["uiTypeCols"][k] = remove_empty(p["uiTypeCols"][k])
    p["uiTypeCols"] = remove_empty(p["uiTypeCols"])

    for k, v in p["sections"].items():
        if len(p["uiTypeCols"].get(v["uiTypeColId"], {})) == 0:
            v["uiTypeColId"] = None

        p["sections"][k] = filter_dict(
            v, DEFAULT_VALUES["section"].keys(), DEFAULT_VALUES["section"]
        )

    for k, v in p["sectionVariants"].items():
        if len(p["codeInfoCols"].get(v["codeInfoColId"], {})) == 0:
            v["codeInfoColId"] = None

        curr = p["sectionVariants"]
        curr[k] = filter_dict(
            v, DEFAULT_VALUES["sectionVariant"].keys(), DEFAULT_VALUES["sectionVariant"]
        )
        if "values" in curr[k]:
            curr[k]["values"] = {
                paramId: filter_dict(
                    curr[k]["values"][paramId],
                    DEFAULT_VALUES["evEntry"].keys(),
                    DEFAULT_VALUES["evEntry"],
                )
                for paramId in curr[k]["values"].keys()
            }
            curr[k]["values"] = remove_empty(curr[k]["values"])
