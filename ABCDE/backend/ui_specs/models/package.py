import sys

from django.db import models

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Package",
    ["name", "owner", "version"],
    base_additional_tables={"version": models.TextField()},
)
for k, v in tables.items():
    setattr(thismodule, k, v)
