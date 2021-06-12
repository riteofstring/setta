import sys

from .arg import Arg
from .arg_value_collection import ArgValueCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "ArgValue", base_parent=Arg, base_has_value=True, additional_rel=ArgValueCollection
)
for k, v in tables.items():
    setattr(thismodule, k, v)
