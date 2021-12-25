import sys

from django.db.models import TextField

from .module import Module
from .object import Object
from .parameter import Parameter
from .table_factory import table_factory

thismodule = sys.modules[__name__]
tables = table_factory(
    "Package",
    ["name", "owner", "version"],
    base_has_uuid=True,
    base_has_name=True,
    base_has_owner=True,
    base_additional_tables={"version": TextField()},
    additional_rel=[Module, Object, Parameter],
)
for k, v in tables.items():
    setattr(thismodule, k, v)
