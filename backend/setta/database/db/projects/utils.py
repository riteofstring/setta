import copy

from setta.database.db.codeInfo.utils import (
    add_defaults_to_code_info,
    add_defaults_to_code_info_cols,
)
from setta.database.db.sections.utils import add_data_column_to_sections, add_defaults_to_sections
from setta.database.db.sectionVariants.utils import add_defaults_to_section_variants
from setta.utils.constants import DEFAULT_VALUES, PROJECT_CONFIG_TABLE_DATA_JSON_FIELDS
from setta.utils.utils import filter_dict_and_remove_from_original


def with_project_config_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["projectConfig"]), **kwargs}


def add_data_column_to_project_config(projectConfig):
    projectConfig["data"] = filter_dict_and_remove_from_original(
        projectConfig["projectConfig"],
        PROJECT_CONFIG_TABLE_DATA_JSON_FIELDS,
        DEFAULT_VALUES["projectConfig"],
    )


def add_defaults_to_project(p):
    p["projectConfig"] = with_project_config_defaults(**p["projectConfig"])
    add_defaults_to_sections(p["sections"])
    add_defaults_to_section_variants(p["sectionVariants"])
    add_defaults_to_code_info(p["codeInfo"])
    add_defaults_to_code_info_cols(p["codeInfoCols"])


