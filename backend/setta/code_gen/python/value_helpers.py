import os
from pathlib import Path
from urllib.request import urlopen

from setta.secrets.password_store import get_password_secret
from setta.utils.paths import get_setta_paths

_BINARY_BASE_URL_ENV = "SETTA_BINARY_BASE_URL"
_RUNTIME_ROOT_ENV = "SETTA_RUNTIME_ROOT"


def read_binary_value(payload: dict[str, object]) -> bytes:
    """Read a binary payload from the local store or via HTTP fallback."""
    content_id = payload.get("contentId")
    if not isinstance(content_id, str) or not content_id:
        raise ValueError("Binary payload missing contentId.")
    runtime_root = os.environ.get(_RUNTIME_ROOT_ENV)
    if runtime_root:
        runtime_path = Path(runtime_root) / "binary" / content_id
        if runtime_path.exists():
            return runtime_path.read_bytes()
    local_path = get_setta_paths().setta_files_root / "binary" / content_id
    if local_path.exists():
        return local_path.read_bytes()
    base_url = os.environ.get(_BINARY_BASE_URL_ENV)
    if not base_url:
        raise FileNotFoundError(f"Missing binary payload: {content_id}")
    base_url = base_url.rstrip("/")
    with urlopen(f"{base_url}/binary/{content_id}") as response:
        return response.read()


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
