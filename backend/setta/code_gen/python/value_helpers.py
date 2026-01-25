import base64
from pathlib import Path


def decode_base64_value(payload: str) -> bytes:
    """Decode a base64 payload into bytes for packaged runtime access."""
    return base64.b64decode(payload.encode("utf-8"))


def read_file_value(path: str) -> str | bytes:
    """
    Read a file from disk, returning text when UTF-8 decoding succeeds and
    falling back to raw bytes for binary artifacts.
    """
    file_path = Path(path)
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return file_path.read_bytes()
