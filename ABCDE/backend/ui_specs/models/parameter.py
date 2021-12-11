import sys

from django.db.models import (
    CASCADE,
    SET_NULL,
    CheckConstraint,
    ForeignKey,
    Q,
    TextField,
)

from .object import Object
from .parameter_collection import ParameterCollection
from .table_factory import table_factory
from .ui_type import UIType

constraints = [
    CheckConstraint(
        check=(Q(parent_object__isnull=False) & Q(parent_collection__isnull=True))
        | (Q(parent_object__isnull=True) & Q(parent_collection__isnull=False)),
        name="parameter_exactly_one_parent",
    )
]

thismodule = sys.modules[__name__]
tables = table_factory(
    "Parameter",
    ["name", "parent_object", "parent_collection"],
    base_has_uuid=True,
    base_has_name=True,
    base_additional_tables={
        "parent_object": ForeignKey(Object, on_delete=CASCADE, null=True),
        "parent_collection": ForeignKey(
            ParameterCollection, on_delete=CASCADE, null=True
        ),
        "default_val": TextField(null=True),
        "type": TextField(null=True),
    },
    base_additional_constraints=constraints,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
