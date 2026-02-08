import json

from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path
from setta.utils.user_config import ensure_setta_user_config_exists


def test_ensure_setta_user_config_creates_default_file() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    assert not config_path.exists()

    error = ensure_setta_user_config_exists(setta_home=setta_home)
    assert error is None

    assert config_path.is_file()
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    assert payload["openWorkspaceFallback"] == "create_local"
    assert payload["defaultCreateLocation"] == "local"
    assert payload["globalSettaFilesBase"] == str(
        (setta_home / "setta_files").resolve(strict=False)
    )

