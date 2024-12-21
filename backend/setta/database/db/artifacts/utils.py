import copy

from setta.utils.constants import DEFAULT_VALUES
from setta.utils.utils import recursive_dict_merge


def with_artifact_defaults(**kwargs):
    return recursive_dict_merge(copy.deepcopy(DEFAULT_VALUES["artifact"]), kwargs)
