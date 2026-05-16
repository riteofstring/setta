from pathlib import Path

from setta.secrets.password_store import get_password_secret


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


def read_password_value(code_obj_impl_id: str) -> str:
    """Fetch a PasswordParam value from the runtime secret store."""
    return get_password_secret(code_obj_impl_id)
