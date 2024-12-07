import copy
import random

from setta.utils.constants import DEFAULT_VALUES, PROJECT_CONFIG_PREVIEW_IMG_COLORS


def with_project_config_defaults(**kwargs):
    return {**copy.deepcopy(DEFAULT_VALUES["projectConfig"]), **kwargs}


def get_random_project_config_preview_img_color():
    return random.choice(PROJECT_CONFIG_PREVIEW_IMG_COLORS)
