import sys

from .module_collection import ModuleCollection
from .object import Object
from .parameter_collection import ParameterCollection
from .parameter_ui_type_collection import ParameterUITypeCollection
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
        "selected_object": Object,
        "entered_values": ParameterValueCollection,
        "ui_types": ParameterUITypeCollection,
        "available_modules": ModuleCollection,
        "available_parameters": ParameterCollection,
        "children": UI,
    },
    forkable=True,
    saveable=True,
    taggable=True,
    additional_rel=[
        UI,
    ],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
