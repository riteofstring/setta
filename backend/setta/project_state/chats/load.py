import logging

from pydantic import ValidationError

from setta.database.db_objs import DBE
from setta.types.chat import Chat, ChatMetadata
from setta.types.id import ID

logger = logging.getLogger(__name__)


def load_chat(dbe: DBE, chat_id: ID) -> Chat | None:
    data = dbe.read_chat(chat_id)
    if not data:
        return None
    try:
        return Chat.model_validate(data)
    except ValidationError as exc:
        logger.warning("Unable to load chat %s: %s", chat_id, exc)
        return None


def load_all_chat_metadata(dbe: DBE) -> list[ChatMetadata]:
    output: list[ChatMetadata] = []
    for path in dbe.list_chat_paths():
        data = dbe.read_json(path)
        if not data:
            continue
        required_keys = {"id", "name", "lastUpdated", "llmConfig", "projectConfigId"}
        if not required_keys.issubset(data.keys()):
            logger.debug(
                "Skipping chat metadata from %s because required fields are missing",
                path,
            )
            continue
        try:
            output.append(
                ChatMetadata.model_validate(
                    {
                        "id": data["id"],
                        "name": data["name"],
                        "lastUpdated": data["lastUpdated"],
                        "llmConfig": data["llmConfig"],
                        "projectConfigId": data["projectConfigId"],
                    }
                )
            )
        except ValidationError as exc:
            logger.warning("Unable to parse metadata for %s: %s", path, exc)
            continue
    output.sort(key=lambda chat: chat.lastUpdated)
    return output
