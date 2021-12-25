import sys

from django.db.models import SET_NULL, ForeignKey

from .object import Object
from .parameter_value_collection import ParameterValueCollection
from .section_type_config import SectionTypeConfig
from .table_factory import table_factory
from .ui import UI

thismodule = sys.modules[__name__]
tables = table_factory(
    "Section",
    ["uuid", "owner"],
    base_has_uuid=True,
    base_has_name=True,
    base_has_owner=True,
    base_additional_tables={
        "selected_object": ForeignKey(Object, on_delete=SET_NULL, null=True),
        "parameter_value_collection": ForeignKey(
            ParameterValueCollection, on_delete=SET_NULL, null=True
        ),
        "section_type_config": ForeignKey(
            SectionTypeConfig, on_delete=SET_NULL, null=True
        ),
        "children": ForeignKey(UI, on_delete=SET_NULL, null=True),
    },
    forkable=True,
    saveable=True,
    taggable=True,
)
for k, v in tables.items():
    setattr(thismodule, k, v)
