from typing import Any

from sqlalchemy import JSON, CheckConstraint, TypeDecorator
from sqlalchemy.orm import DeclarativeBase, Mapped, MappedAsDataclass, mapped_column

from setta.types.project_state import ProjectState


class PydanticColumnType(TypeDecorator):
    """Store Pydantic models as JSON"""

    impl = JSON
    cache_ok = True

    def __init__(self, pydantic_model: type[ProjectState]):
        super().__init__()
        self.pydantic_model = pydantic_model

    def process_bind_param(
        self, value: ProjectState | None, dialect: Any
    ) -> dict | None:
        if value is None:
            return None
        return value.model_dump()

    def process_result_value(
        self, value: dict | None, dialect: Any
    ) -> ProjectState | None:
        if value is None:
            return None
        return self.pydantic_model(**value)


class BaseTable(MappedAsDataclass, DeclarativeBase):
    pass


class ProjectStateTable(BaseTable):
    __tablename__ = "ProjectState"

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[ProjectState] = mapped_column(PydanticColumnType(ProjectState))

    __table_args__ = (CheckConstraint("id = 1", name="projectstate_id_check"),)
