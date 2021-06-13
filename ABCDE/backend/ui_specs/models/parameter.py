import sys

from django.db.models import CheckConstraint, Q

from .object import Object
from .parameter_collection import ParameterCollection
from .table_factory import table_factory

constraints = [
    CheckConstraint(
        check=(Q(parent_object__isnull=False) | Q(parent_collection__isnull=False))
        & (Q(parent_object__isnull=True) | Q(parent_collection__isnull=True)),
        name="parameter_exactly_one_parent",
    )
]

thismodule = sys.modules[__name__]
tables = table_factory(
    "Parameter",
    ["name", "parent_object", "parent_collection"],
    base_has_name=True,
    base_additional_tables={
        "parent_object": Object,
        "parent_collection": ParameterCollection,
    },
    base_additional_constraints=constraints,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
