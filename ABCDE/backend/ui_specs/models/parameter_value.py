import sys

from django.db.models import CASCADE, ForeignKey

from .entered_value import EnteredValue
from .parameter import Parameter
from .parameter_value_collection import ParameterValueCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "ParameterValue",
    ["parent", "collection"],
    base_parent=Parameter,
    base_additional_tables={
        "collection": ForeignKey(ParameterValueCollection, on_delete=CASCADE),
        "entered_value": ForeignKey(EnteredValue, on_delete=CASCADE, null=True),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
