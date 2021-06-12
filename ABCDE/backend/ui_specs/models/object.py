import sys

from .module import Module
from .object_collection import ObjectCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("Object", base_parent=Module, additional_rel=ObjectCollection)
for k, v in tables.items():
    setattr(thismodule, k, v)
