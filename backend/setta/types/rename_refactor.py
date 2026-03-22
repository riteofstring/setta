from pydantic import BaseModel

from setta.types.generated.dependency_keys import BaseDependencyKeyUnion


class RenameReferenceChangedValue(BaseModel):
    depKey: BaseDependencyKeyUnion
    newValue: str
