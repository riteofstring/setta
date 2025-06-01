from sqlalchemy import CheckConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ProjectState(Base):
    __tablename__ = "ProjectState"

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[str | None]

    __table_args__ = (CheckConstraint("id = 1", name="projectstate_id_check"),)
