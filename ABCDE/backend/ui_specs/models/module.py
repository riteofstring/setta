import sys

from .package import Package
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Module",
    ["name", "parent"],
    base_parent=Package,
    base_has_uuid=True,
    base_has_name=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
