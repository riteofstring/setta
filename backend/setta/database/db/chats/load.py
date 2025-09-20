from setta.types.chat_messages import Chat, ChatMessage, ChatMetadata


def load_chat(db, chat_id: str):
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


def load_all_chat_metadata(db):
    stmt = select(ChatTable).order_by(ChatTable.lastUpdated)
    results = db.scalars(stmt).all()
    output: list[ChatMetadata] = []
    for row in results:
        output.append(
            ChatMetadata(id=row.id, name=row.name, lastUpdated=row.lastUpdated)
        )
    return output
