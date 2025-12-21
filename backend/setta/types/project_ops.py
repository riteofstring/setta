from typing import Any, Literal

from pydantic import BaseModel, TypeAdapter

from setta.types.id import ID


class BaseProjectOp(BaseModel):
    type: Any


class RunOp(BaseProjectOp):
    type: Literal["run"] = "run"
    runKind: str | None = None
    sectionId: ID | None = None
    cliId: str | None = None


ProjectOp = RunOp
ProjectOpTypeAdapter = TypeAdapter(ProjectOp)
