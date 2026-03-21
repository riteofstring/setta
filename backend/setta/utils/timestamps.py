from datetime import datetime, timezone


def get_now_timestamp():
    return datetime.now(timezone.utc)


def parse_timestamp_str(timestamp_str: str):
    dt = datetime.fromisoformat(timestamp_str)
    return dt.astimezone(timezone.utc)
