import sys

from django.db.models import CASCADE, ForeignKey

from .parameter import Parameter
from .parameter_value_collection import ParameterValueCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "ParameterValue",
    ["parent", "collection"],
    base_parent=Parameter,
    base_has_value=True,
    base_additional_tables={
        "collection": ForeignKey(ParameterValueCollection, on_delete=CASCADE)
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
