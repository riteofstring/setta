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


def filter_data_for_json_export(p):
    p["projectConfig"] = filter_dict(
        p["projectConfig"], None, DEFAULT_VALUES["projectConfig"]
    )
    for k, v in p["sections"].items():
        p["sections"][k] = filter_dict(v, None, DEFAULT_VALUES["section"])

    for k, v in p["sectionVariants"].items():
        curr = p["sectionVariants"]
        curr[k] = filter_dict(v, None, DEFAULT_VALUES["sectionVariant"])
        if "values" in curr[k]:
            curr[k]["values"] = filter_dict(
                curr[k]["values"], None, DEFAULT_VALUES["evEntry"]
            )

    for k, v in p["codeInfo"].items():
        p["codeInfo"][k] = filter_dict(v, None, DEFAULT_VALUES["codeInfo"])

    for k, v in p["codeInfoCols"].items():
        p["codeInfoCols"][k] = filter_dict(v, None, DEFAULT_VALUES["codeInfoCol"])

    for k, v in p["uiTypeCols"].items():
        for paramId, uiTypeColInfo in v.items():
            p["uiTypeCols"][k][paramId] = filter_dict(
                uiTypeColInfo, None, DEFAULT_VALUES["uiTypeColEntry"]
            )
