import sys

from django.db.models import CASCADE, ForeignKey, IntegerField

from .section import Section
from .table_factory import table_factory
from .ui import UI

thismodule = sys.modules[__name__]
tables = table_factory(
    "SectionPosition",
    ["ui", "section"],
    base_additional_tables={
        "ui": ForeignKey(UI, on_delete=CASCADE),
        "section": ForeignKey(Section, on_delete=CASCADE),
        "position": IntegerField(),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
