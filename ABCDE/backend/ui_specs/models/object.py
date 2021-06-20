import sys

from .module import Module
from .object_collection import ObjectCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Object",
    ["name", "parent"],
    base_parent=Module,
    base_has_name=True,
    additional_rel=[ObjectCollection],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
