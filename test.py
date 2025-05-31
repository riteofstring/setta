# Full round-trip: timestamp -> filename -> back to datetime

from setta.database.utils import create_new_id
from setta.types.chat_messages import ChatMetadata
from setta.utils.timestamps import (
    parse_timestamp_str,
)

x = ChatMetadata(id=create_new_id(), name="dogs")

print(parse_timestamp_str("2025-05-30T19:34:41Z"))
