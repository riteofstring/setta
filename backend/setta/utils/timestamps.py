from datetime import datetime, timezone


def get_now_timestamp():
    return datetime.now(timezone.utc)


def timestamp_to_filename(timestamp: datetime):
    return timestamp.strftime("%Y%m%d_%H%M%S_%f")


def filename_to_datetime(filename_timestamp: str):
    dt = datetime.strptime(filename_timestamp, "%Y%m%d_%H%M%S_%f")
    return dt.replace(tzinfo=timezone.utc)


def parse_timestamp_str(timestamp_str: str):
    dt = datetime.fromisoformat(timestamp_str)
    return dt.astimezone(timezone.utc)
