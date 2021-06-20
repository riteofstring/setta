import sys

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "ObjectCollection",
    ["name", "owner"],
    base_has_name=True,
    base_has_owner=True,
    forkable=True,
    saveable=True,
    taggable=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
