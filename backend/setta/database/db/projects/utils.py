import copy

from setta.database.db.codeInfo.utils import (
    add_defaults_to_code_info,
    add_defaults_to_code_info_cols,
)
from setta.database.db.sections.utils import add_defaults_to_sections
from setta.database.db.sectionVariants.utils import add_defaults_to_section_variants
from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import filter_dict


def with_project_config_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["projectConfig"]), **kwargs}


def add_defaults_to_project(p):
    p["projectConfig"] = with_project_config_defaults(**p["projectConfig"])
    add_defaults_to_sections(p["sections"])
    add_defaults_to_section_variants(p["sectionVariants"])
    add_defaults_to_code_info(p["codeInfo"])
    add_defaults_to_code_info_cols(p["codeInfoCols"])


def filter_data_for_json_export(p):
    p["projectConfig"] = filter_dict(
        p["projectConfig"], None, DEFAULT_VALUES["projectConfig"]
    )
    for k, v in p["sections"].items():
        p["sections"][k] = filter_dict(v, None, DEFAULT_VALUES["section"])

    for k, v in p["sectionVariants"].items():
        p["sectionVariants"][k] = filter_dict(v, None, DEFAULT_VALUES["sectionVariant"])
        if "values" in v:
            v["values"] = filter_dict(v["values"], None, DEFAULT_VALUES["evEntry"])

    for k, v in p["codeInfo"].items():
        p["codeInfo"][k] = filter_dict(v, None, DEFAULT_VALUES["codeInfo"])

    for k, v in p["codeInfoCols"].items():
        p["codeInfoCols"][k] = filter_dict(v, None, DEFAULT_VALUES["codeInfoCol"])

    for k, v in p["uiTypeCols"].items():
        p["uiTypeCols"][k] = filter_dict(v, None, DEFAULT_VALUES["uiTypeColEntry"])
