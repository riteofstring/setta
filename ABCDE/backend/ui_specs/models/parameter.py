import sys

from .object import Object
from .parameter_collection import ParameterCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Parameter", base_parent=Object, additional_rel=ParameterCollection
)
for k, v in tables.items():
    setattr(thismodule, k, v)
