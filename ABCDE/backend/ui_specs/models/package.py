import sys

from .package_collection import PackageCollection
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory("Package", additional_rel=PackageCollection)
for k, v in tables.items():
    setattr(thismodule, k, v)
