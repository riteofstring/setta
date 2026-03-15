from typing import Any
from uuid import uuid4

from pydantic import GetCoreSchemaHandler
from pydantic_core import CoreSchema, core_schema


class ID(str):
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> CoreSchema:
        return core_schema.no_info_after_validator_function(cls, handler(str))


def create_new_id() -> ID:
    return ID(uuid4())


TemporaryToCanonicalIDMap = dict[ID, ID]
CanonicalToTemporaryIDMap = dict[ID, ID]
