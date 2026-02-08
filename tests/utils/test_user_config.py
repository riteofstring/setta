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


def test_load_setta_user_config_uses_defaults_without_creating_file() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    assert not config_path.exists()

    clear_setta_user_config_cache()
    config = load_setta_user_config(setta_home=setta_home)

    assert config.auto_mode == "create_local"
    assert config.global_setta_files_base == (setta_home / "setta_files").resolve(
        strict=False
    )
    assert not config_path.exists()


def test_load_setta_user_config_rejects_invalid_json() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text("{", encoding="utf-8")

    clear_setta_user_config_cache()
    with pytest.raises(ValueError, match=r"Invalid JSON"):
        load_setta_user_config(setta_home=setta_home)


def test_load_setta_user_config_rejects_non_object_payload() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text(json.dumps(["not", "an", "object"]) + "\n", encoding="utf-8")

    clear_setta_user_config_cache()
    with pytest.raises(ValueError, match=r"must be a JSON object"):
        load_setta_user_config(setta_home=setta_home)


def test_load_setta_user_config_resolves_relative_global_base() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": "state",
                "autoMode": "create_local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_user_config_cache()
    config = load_setta_user_config(setta_home=setta_home)
    assert config.global_setta_files_base == (setta_home / "state").resolve(strict=False)


def test_load_setta_user_config_rejects_invalid_auto_mode() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config_path.write_text(
        json.dumps(
            {
                "autoMode": "nope",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_user_config_cache()
    with pytest.raises(ValueError, match=r"autoMode must be one of"):
        load_setta_user_config(setta_home=setta_home)


def test_load_setta_user_config_rejects_global_base_that_is_file() -> None:
    setta_home = resolve_setta_home()
    config_path = resolve_setta_user_config_path(setta_home=setta_home)
    config_path.parent.mkdir(parents=True, exist_ok=True)

    base_path = setta_home / "notadir"
    base_path.write_text("nope", encoding="utf-8")

    config_path.write_text(
        json.dumps(
            {
                "globalSettaFilesBase": str(base_path),
                "autoMode": "create_local",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    clear_setta_user_config_cache()
    with pytest.raises(ValueError, match=r"globalSettaFilesBase is not a directory"):
        load_setta_user_config(setta_home=setta_home)
