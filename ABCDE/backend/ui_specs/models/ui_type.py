import sys

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "UIType",
    ["value"],
    base_has_value=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
