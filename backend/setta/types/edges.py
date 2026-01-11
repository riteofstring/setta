from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.id import ID


class EdgePort(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    accessor: str = ""


class Edge(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    sourceSectionId: ID
    sourceVariantId: ID
    sourcePortId: ID
    targetSectionId: ID
    targetVariantId: ID
    targetPortId: ID
    type: str = "default"
    label: str | None = None
    style: dict[str, str | int | float] | None = None
    animated: bool = False
    hidden: bool = False
    zIndex: int = 0
    data: dict[str, object] | None = None
    selected: bool = False
