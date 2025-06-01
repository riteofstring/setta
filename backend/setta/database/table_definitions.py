from datetime import datetime
from pathlib import Path

from sqlalchemy import (
    DDL,
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Text,
    TypeDecorator,
    UniqueConstraint,
    event,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    MappedAsDataclass,
    mapped_column,
    relationship,
)

from setta.types.artifact import ArtifactType
from setta.types.chat_messages import ChatRole
from setta.types.notifications import SettaNotificationType


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


class BaseTable(MappedAsDataclass, DeclarativeBase):
    pass


class ProjectStateTable(BaseTable):
    __tablename__ = "ProjectState"

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[dict | None] = mapped_column(JSON)

    __table_args__ = (CheckConstraint("id = 1", name="projectstate_id_check"),)


class ArtifactTable(BaseTable):
    __tablename__ = "Artifact"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    path: Mapped[Path] = mapped_column(PathType)
    type: Mapped[ArtifactType]

    __table_args__ = (UniqueConstraint("path", name="artifact_unique_constraint"),)


class NotificationsTable(BaseTable):
    __tablename__ = "Notifications"

    id: Mapped[str] = mapped_column(primary_key=True)
    projectConfigId: Mapped[str]
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp()
    )
    type: Mapped[SettaNotificationType]
    message: Mapped[str]


class ChatTable(BaseTable):
    __tablename__ = "Chat"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    lastUpdated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp()
    )

    # Relationship to messages
    messages: Mapped[list["ChatMessageTable"]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="ChatMessageTable.order",
    )


class ChatMessageTable(BaseTable):
    __tablename__ = "ChatMessage"

    id: Mapped[str] = mapped_column(primary_key=True)
    chatId: Mapped[str] = mapped_column(ForeignKey("Chat.id", ondelete="CASCADE"))
    order: Mapped[int] = mapped_column(name="order")  # "order" is a reserved word
    role: Mapped[ChatRole]
    content: Mapped[list] = mapped_column(JSON)

    # Relationship to chat
    chat: Mapped["ChatTable"] = relationship(back_populates="messages")


class UUIDMappingForLLMTable(BaseTable):
    __tablename__ = "UUIDMappingForLLM"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    uuid_column: Mapped[str] = mapped_column("uuid", unique=True)


# 2. Create trigger using CURRENT_TIMESTAMP
chat_timestamp_trigger = DDL("""
CREATE TRIGGER IF NOT EXISTS update_chat_session_timestamp
AFTER INSERT ON ChatMessage
BEGIN
    UPDATE Chat
    SET lastUpdated = CURRENT_TIMESTAMP
    WHERE id = NEW.chatId;
END;
""")

event.listen(ChatMessageTable.__table__, "after_create", chat_timestamp_trigger)


@event.listens_for(ProjectStateTable.__table__, "after_create")
def insert_initial_state(target, connection, **kw):
    connection.execute(target.insert(), {"id": 1, "state": None})
