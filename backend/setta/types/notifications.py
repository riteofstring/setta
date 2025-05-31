from datetime import datetime
from enum import StrEnum

from groq import BaseModel
from pydantic import Field

from setta.database.utils import create_new_id
from setta.utils.timestamps import get_now_timestamp


class SettaNotificationType(StrEnum):
    SUCCESS = "success"
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"
    SAVE = "save"


class SettaNotification(BaseModel):
    id: str = Field(default_factory=create_new_id)
    type: SettaNotificationType = SettaNotificationType.INFO
    message: str
    temporary: bool = False
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    metadata: dict = Field(default_factory=dict)
    read_status: bool = False
