import sys

from .table_factory import table_factory
from .ui import UI

thismodule = sys.modules[__name__]
tables = table_factory("SectionCollection", additional_rel=UI)
for k, v in tables.items():
    setattr(thismodule, k, v)
