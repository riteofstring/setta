import sys

from django.db.models import CASCADE, BooleanField, ForeignKey

from .parameter import Parameter
from .parameter_value_collection import ParameterValueCollection
from .table_factory import table_factory
from .ui_type import UIType

thismodule = sys.modules[__name__]
tables = table_factory(
    "ParameterValue",
    ["parent", "collection", "ui_type"],
    base_parent=Parameter,
    base_has_value=True,
    base_additional_tables={
        "collection": ForeignKey(ParameterValueCollection, on_delete=CASCADE),
        "ui_type": ForeignKey(UIType, on_delete=CASCADE),
        "is_current": BooleanField(default=True),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
