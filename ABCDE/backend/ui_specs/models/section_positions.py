import sys

from django.db import models

from .section import Section
from .table_factory import table_factory
from .ui import UI

thismodule = sys.modules[__name__]
tables = table_factory(
    "SectionPositions",
    ["ui", "section", "position"],
    base_additional_tables={
        "ui": UI,
        "section": Section,
        "position": models.IntegerField(),
    },
)
for k, v in tables.items():
    setattr(thismodule, k, v)
