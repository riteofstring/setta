from datetime import datetime, timezone


def get_now_timestamp():
    return datetime.now(timezone.utc)
