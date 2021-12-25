import sys

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Module",
    ["uuid", "name"],
    base_has_uuid=True,
    base_has_name=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
