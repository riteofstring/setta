import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, MappedAsDataclass, mapped_column

from setta.types.artifact import ArtifactType
from setta.types.notifications import SettaNotificationType
from setta.types.project_state import ProjectState


class PathType(TypeDecorator):
    """A SQLAlchemy type that stores pathlib.Path objects as strings."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return Path(value)
        return value


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


class ArtifactTable(BaseTable):
    __tablename__ = "BasicArtifact"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    path: Mapped[Path] = mapped_column(PathType)
    type: Mapped[ArtifactType]

    __table_args__ = (UniqueConstraint("path", name="artifact_unique_constraint"),)


class NotificationsTable(BaseTable):
    __tablename__ = "Notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    projectConfigId: Mapped[uuid.UUID]
    timestamp: Mapped[datetime]
    type: Mapped[SettaNotificationType]
    message: Mapped[str]
