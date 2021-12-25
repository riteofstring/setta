import sys

from django.db.models import CASCADE, ForeignKey

from .parameter import Parameter
from .parameter_ui_type_collection import ParameterUITypeCollection
from .table_factory import table_factory
from .ui_type_config import UITypeConfig

thismodule = sys.modules[__name__]
tables = table_factory(
    "ParameterUIType",
    ["parent", "collection"],
    base_parent=Parameter,
    base_additional_tables={
        "collection": ForeignKey(ParameterUITypeCollection, on_delete=CASCADE),
        "ui_type_config": ForeignKey(UITypeConfig, on_delete=CASCADE, null=True),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
