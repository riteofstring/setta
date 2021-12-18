import sys

from .object_collection import ObjectCollection
from .parameter_collection import ParameterCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "UI",
    ["uuid", "owner"],
    base_has_uuid=True,
    base_has_name=True,
    base_has_owner=True,
    forkable=True,
    saveable=True,
    taggable=True,
    additional_rel=[ObjectCollection, ParameterCollection],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
