import sys

from .arg_collection import ArgCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("Arg", base_parent=ArgCollection)
for k, v in tables.items():
    setattr(thismodule, k, v)
