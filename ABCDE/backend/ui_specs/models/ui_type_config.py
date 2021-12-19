import sys

from django.db.models import SET_NULL, ForeignKey, JSONField

from .table_factory import table_factory
from .ui_type import UIType

thismodule = sys.modules[__name__]
tables = table_factory(
    "UITypeConfig",
    ["uuid", "owner"],
    base_has_name=True,
    base_has_owner=True,
    base_has_uuid=True,
    base_additional_tables={
        "ui_type": ForeignKey(UIType, on_delete=SET_NULL, null=True),
        "config": JSONField(null=True),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
