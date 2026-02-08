import json

import pytest

from setta.utils.setta_home import resolve_setta_home, resolve_setta_user_config_path
from setta.utils.user_config import (
    clear_setta_user_config_cache,
    ensure_setta_user_config_exists,
    load_setta_user_config,
)


def test_ensure_setta_user_config_creates_default_file() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    assert not config_path.exists()

    error = ensure_setta_user_config_exists(setta_home=setta_home)
    assert error is None

    assert config_path.is_file()
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    assert payload["autoMode"] == "create_local"
    assert payload["globalSettaFilesBase"] == str(
        (setta_home / "setta_files").resolve(strict=False)
    )


def test_load_setta_user_config_rejects_legacy_keys() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text(
        json.dumps(
            {
                "defaultCreateLocation": "local",
                "openWorkspaceFallback": "create_local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_user_config_cache()
    with pytest.raises(ValueError, match=r"openWorkspaceFallback"):
        load_setta_user_config(setta_home=setta_home)
