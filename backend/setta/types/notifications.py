from datetime import datetime
from enum import StrEnum

from groq import BaseModel
from pydantic import Field, field_serializer

from setta.database.utils import create_new_id
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp

SettaNotificationType = StrEnum(
    "SettaNotificationType", ["success", "error", "warning", "info", "save"]
)


class SettaNotification(BaseModel):
    id: str = Field(default_factory=create_new_id)
    projectConfigId: str = C.NOTIFICATION_IS_FOR_ALL_PROJECTS
    type: SettaNotificationType = SettaNotificationType.info
    message: str
    temporary: bool = False
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    metadata: dict = Field(default_factory=dict)
    read_status: bool = False

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()
