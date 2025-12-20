from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_serializer

from setta.database.utils import create_new_id
from setta.types.id import ID
from setta.utils.constants import C
from setta.utils.timestamps import get_now_timestamp


class SettaNotificationType(str, Enum):
    error = "error"
    warning = "warning"
    info = "info"
    save = "save"


class SettaNotification(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    projectConfigId: ID = Field(
        default_factory=lambda: ID(C.NOTIFICATION_IS_FOR_ALL_PROJECTS)
    )
    type: SettaNotificationType = SettaNotificationType.info
    message: str
    temporary: bool = True
    timestamp: datetime = Field(default_factory=get_now_timestamp)
    metadata: dict = Field(default_factory=dict)
    read_status: bool = False

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()


class SettaBackendLogEventSeverity(str, Enum):
    critical = "critical"
    error = "error"
    warning = "warning"
    info = "info"


class SettaBackendLogEvent(BaseModel):
    id: ID = Field(default_factory=create_new_id)
    projectConfigId: ID | None = None
    severity: SettaBackendLogEventSeverity = SettaBackendLogEventSeverity.info
    message: str
    timestamp: datetime = Field(default_factory=get_now_timestamp)

    @field_serializer("timestamp")
    def serialize_timestamp(self, timestamp: datetime):
        return timestamp.isoformat()
