import sys

from django.db.models import CASCADE, ForeignKey

from .object_collection import ObjectCollection
from .parameter_collection import ParameterCollection
from .section_type import SectionType
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "SectionTypeConfig",
    ["uuid", "owner"],
    base_has_uuid=True,
    base_has_name=True,
    base_has_owner=True,
    base_additional_tables={
        "section_type": ForeignKey(SectionType, on_delete=CASCADE, null=True),
    },
    additional_rel=[ObjectCollection, ParameterCollection],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
