# Full round-trip: timestamp -> filename -> back to datetime

from setta.types.notifications import SettaNotification

s = SettaNotification(message="hi").model_dump()
