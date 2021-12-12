import sys

from django.db.models import SET_NULL, ForeignKey

from .object import Object
from .parameter_ui_type_collection import ParameterUITypeCollection
from .parameter_value_collection import ParameterValueCollection
from .section_type import SectionType
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
        "entered_values": ForeignKey(
            ParameterValueCollection, on_delete=SET_NULL, null=True
        ),
        "ui_types": ForeignKey(
            ParameterUITypeCollection, on_delete=SET_NULL, null=True
        ),
        "section_type_config": ForeignKey(
            SectionTypeConfig, on_delete=SET_NULL, null=True
        ),
    },
    forkable=True,
    saveable=True,
    taggable=True,
    additional_rel=[(SectionType, UI)],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
