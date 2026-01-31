from pathlib import Path


def read_binary_value(payload: dict[str, object]) -> bytes:
    """Read a binary payload from the local binary store."""
    content_id = payload.get("contentId")
    if not isinstance(content_id, str) or not content_id:
        raise ValueError("Binary payload missing contentId.")
    return (Path("setta_files") / "binary" / content_id).read_bytes()


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
