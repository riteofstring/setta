from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from setta.database.table_definitions import ChatTable, UUIDMappingForLLMTable
from setta.types.ai import ID, IDToUUIDForLLM, UUIDToIDForLLM
from setta.types.chat_messages import Chat, ChatMessage, ChatMetadata


def load_chat(db: Session, chat_id: str):
    # Load chat with all messages in one query using eager loading
    stmt = (
        select(ChatTable)
        .where(ChatTable.id == chat_id)
        .options(selectinload(ChatTable.messages))
    )

    chat_row = db.scalars(stmt).first()

    if not chat_row:
        return None

    # Convert to Pydantic model
    return Chat(
        id=chat_row.id,
        name=chat_row.name,
        lastUpdated=chat_row.lastUpdated,
        messages=[
            ChatMessage(
                id=msg.id,
                role=msg.role,
                content=msg.content,
            )
            for msg in chat_row.messages
        ],
    )


def load_all_chat_metadata(db: Session):
    stmt = select(ChatTable).order_by(ChatTable.lastUpdated)
    results = db.scalars(stmt).all()
    output: list[ChatMetadata] = []
    for row in results:
        output.append(
            ChatMetadata(id=row.id, name=row.name, lastUpdated=row.lastUpdated)
        )
    return output


def load_uuid_mapping_for_llm(db: Session) -> tuple[IDToUUIDForLLM, UUIDToIDForLLM]:
    stmt = select(UUIDMappingForLLMTable)
    id_to_uuid: IDToUUIDForLLM = {}
    uuid_to_id = {}
    for row in db.scalars(stmt).all():
        id_to_uuid[ID(row.id)] = row.uuid_column
        uuid_to_id[row.uuid_column] = str(row.id)
    return id_to_uuid, uuid_to_id
