import sys

from django.db.models import TextField

from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "EnteredValue",
    ["uuid", "owner"],
    base_has_uuid=True,
    base_has_owner=True,
    base_additional_tables={
        "value": TextField(null=True),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
