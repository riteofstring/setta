import sys

from .module_collection import ModuleCollection
from .package import Package
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("Module", base_parent=Package, additional_rel=ModuleCollection)
for k, v in tables.items():
    setattr(thismodule, k, v)
