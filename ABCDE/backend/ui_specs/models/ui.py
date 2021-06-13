import sys

from .module_collection import ModuleCollection
from .parameter_collection import ParameterCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "UI",
    ["name", "owner"],
    base_has_name=True,
    base_has_owner=True,
    forkable=True,
    saveable=True,
    taggable=True,
    additional_rel=[ModuleCollection, ParameterCollection],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
