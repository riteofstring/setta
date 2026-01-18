import tempfile
import unittest
from pathlib import Path

from setta.database.db_objs import DBE
from setta.utils.structured_data import (
    read_json_source_payload,
    write_json_source_payload,
)


class StructuredDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self._temp_dir.name)
        self.dbe = DBE(self.root)

    def tearDown(self) -> None:
        self._temp_dir.cleanup()

    def test_yaml_round_trip(self) -> None:
        path = self.root / "source.yaml"
        path.write_text(
            "root:\n"
            "  value: 1\n"
            "  items:\n"
            "    - foo\n"
            "    - 3\n"
            "    - true\n"
        )
        payload = read_json_source_payload(path, self.dbe)
        self.assertEqual(
            {"root": {"value": 1, "items": ["foo", 3, True]}},
            payload,
        )

        out_path = self.root / "out.yaml"
        write_json_source_payload(out_path, payload, self.dbe)
        reloaded = read_json_source_payload(out_path, self.dbe)
        self.assertEqual(payload, reloaded)

    def test_toml_round_trip(self) -> None:
        path = self.root / "source.toml"
        path.write_text('root = { value = 1, items = ["foo", "bar"] }')
        payload = read_json_source_payload(path, self.dbe)
        self.assertEqual(
            {"root": {"value": 1, "items": ["foo", "bar"]}},
            payload,
        )

        out_path = self.root / "out.toml"
        write_json_source_payload(out_path, payload, self.dbe)
        reloaded = read_json_source_payload(out_path, self.dbe)
        self.assertEqual(payload, reloaded)

    def test_yaml_non_json_type_rejected(self) -> None:
        path = self.root / "source.yaml"
        path.write_text("items: !!set {a: null, b: null}\n")
        with self.assertRaises(ValueError):
            read_json_source_payload(path, self.dbe)

    def test_toml_non_json_type_rejected(self) -> None:
        path = self.root / "source.toml"
        path.write_text("when = 2020-01-01T00:00:00Z\n")
        with self.assertRaises(ValueError):
            read_json_source_payload(path, self.dbe)

    def test_top_level_list_rejected(self) -> None:
        path = self.root / "source.json"
        path.write_text("[1, 2]\n")
        with self.assertRaises(ValueError):
            read_json_source_payload(path, self.dbe)

    def test_unknown_extension_rejected(self) -> None:
        path = self.root / "source.txt"
        path.write_text("{}\n")
        with self.assertRaises(ValueError):
            read_json_source_payload(path, self.dbe)

    def test_write_json_preserves_key_order(self) -> None:
        path = self.root / "ordered.json"
        payload = {"first_key": 1, "second_key": 2}
        write_json_source_payload(path, payload, self.dbe)
        text = path.read_text()
        self.assertLess(text.index('"first_key"'), text.index('"second_key"'))

    def test_write_yaml_preserves_key_order(self) -> None:
        path = self.root / "ordered.yaml"
        payload = {"first_key": 1, "second_key": 2}
        write_json_source_payload(path, payload, self.dbe)
        text = path.read_text()
        self.assertLess(text.index("first_key:"), text.index("second_key:"))

    def test_write_toml_preserves_key_order(self) -> None:
        path = self.root / "ordered.toml"
        payload = {"first_key": 1, "second_key": 2}
        write_json_source_payload(path, payload, self.dbe)
        text = path.read_text()
        self.assertLess(text.index("first_key"), text.index("second_key"))
