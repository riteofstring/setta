from datetime import datetime, timezone


def get_now_timestamp():
    """Returns current UTC timestamp in ISO format with Z suffix."""
    return datetime.now(timezone.utc)


def parse_timestamp(timestamp_str: str):
    """Convert ISO timestamp string back to datetime object."""
    dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
    return dt.astimezone(timezone.utc)


def timestamp_to_filename(timestamp: datetime):
    """Convert ISO timestamp to filename-friendly format with microsecond precision."""
    return timestamp.strftime("%Y%m%d_%H%M%S_%f")


def filename_to_datetime(filename_timestamp: str):
    """Convert filename timestamp back to UTC datetime object."""
    dt = datetime.strptime(filename_timestamp, "%Y%m%d_%H%M%S_%f")
    return dt.replace(tzinfo=timezone.utc)
