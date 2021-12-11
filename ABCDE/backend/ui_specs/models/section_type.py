import sys

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "SectionType",
    ["name"],
    base_has_name=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
