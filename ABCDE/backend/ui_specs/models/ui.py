import sys

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("UI")
for k, v in tables.items():
    setattr(thismodule, k, v)
