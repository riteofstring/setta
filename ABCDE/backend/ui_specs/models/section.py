import sys

from .section_collection import SectionCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("Section", additional_rel=SectionCollection)
for k, v in tables.items():
    setattr(thismodule, k, v)
