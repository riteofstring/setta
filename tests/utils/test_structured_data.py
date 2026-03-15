import pytest

from setta.database.db_objs import DBE
from setta.utils.structured_data import (
    read_json_source_payload,
    write_json_source_payload,
)


@pytest.fixture
def structured_env(tmp_path):
    return tmp_path, DBE(tmp_path)


def test_yaml_round_trip(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.yaml"
    path.write_text(
        "root:\n"
        "  value: 1\n"
        "  items:\n"
        "    - foo\n"
        "    - 3\n"
        "    - true\n"
    )
    payload = read_json_source_payload(path, dbe)
    assert payload == {"root": {"value": 1, "items": ["foo", 3, True]}}

    out_path = root / "out.yaml"
    write_json_source_payload(out_path, payload, dbe)
    reloaded = read_json_source_payload(out_path, dbe)
    assert reloaded == payload


def test_toml_round_trip(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.toml"
    path.write_text('root = { value = 1, items = ["foo", "bar"] }')
    payload = read_json_source_payload(path, dbe)
    assert payload == {"root": {"value": 1, "items": ["foo", "bar"]}}

    out_path = root / "out.toml"
    write_json_source_payload(out_path, payload, dbe)
    reloaded = read_json_source_payload(out_path, dbe)
    assert reloaded == payload


def test_yaml_non_json_type_rejected(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.yaml"
    path.write_text("items: !!set {a: null, b: null}\n")
    with pytest.raises(ValueError):
        read_json_source_payload(path, dbe)


def test_toml_non_json_type_rejected(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.toml"
    path.write_text("when = 2020-01-01T00:00:00Z\n")
    with pytest.raises(ValueError):
        read_json_source_payload(path, dbe)


def test_top_level_list_rejected(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.json"
    path.write_text("[1, 2]\n")
    with pytest.raises(ValueError):
        read_json_source_payload(path, dbe)


def test_unknown_extension_rejected(structured_env) -> None:
    root, dbe = structured_env
    path = root / "source.txt"
    path.write_text("{}\n")
    with pytest.raises(ValueError):
        read_json_source_payload(path, dbe)


def test_write_json_preserves_key_order(structured_env) -> None:
    root, dbe = structured_env
    path = root / "ordered.json"
    payload = {"first_key": 1, "second_key": 2}
    write_json_source_payload(path, payload, dbe)
    text = path.read_text()
    assert text.index('"first_key"') < text.index('"second_key"')


def test_write_yaml_preserves_key_order(structured_env) -> None:
    root, dbe = structured_env
    path = root / "ordered.yaml"
    payload = {"first_key": 1, "second_key": 2}
    write_json_source_payload(path, payload, dbe)
    text = path.read_text()
    assert text.index("first_key:") < text.index("second_key:")


def test_write_toml_preserves_key_order(structured_env) -> None:
    root, dbe = structured_env
    path = root / "ordered.toml"
    payload = {"first_key": 1, "second_key": 2}
    write_json_source_payload(path, payload, dbe)
    text = path.read_text()
    assert text.index("first_key") < text.index("second_key")
