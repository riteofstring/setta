import sys

from django.db.models import SET_NULL, ForeignKey, TextField

from .object import Object
from .object_collection import ObjectCollection
from .parameter_collection import ParameterCollection
from .parameter_value_collection import ParameterValueCollection
from .table_factory import table_factory
from .ui import UI

thismodule = sys.modules[__name__]
tables = table_factory(
    "Section",
    ["name", "owner"],
    base_has_name=True,
    base_has_owner=True,
    base_additional_tables={
        "variable_name": TextField(),
        "selected_object": ForeignKey(Object, on_delete=SET_NULL, null=True),
        "entered_values": ForeignKey(
            ParameterValueCollection, on_delete=SET_NULL, null=True
        ),
        "children": ForeignKey(UI, on_delete=SET_NULL, null=True),
    },
    forkable=True,
    saveable=True,
    taggable=True,
    additional_rel=[UI, ObjectCollection, ParameterCollection],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
