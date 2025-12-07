import unittest

from setta.mcp.utils import (
    IDDoesNotExist,
    convert_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.types.id import ID


class IDConversionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.canonical_to_temp: dict[ID, ID] = {}
        self.temp_to_canonical: dict[ID, ID] = {}

    def test_convert_canonical_rewrites_nested_payloads(self) -> None:
        payload = {
            "wrapper": {
                "items": [
                    ID("canonical-1"),
                    {"inner": ID("canonical-2")},
                ],
                ID("canonical-3"): "value",
            },
            "duplicate": ID("canonical-1"),
        }

        converted = convert_canonical_ids_to_temporary(
            payload, self.canonical_to_temp, self.temp_to_canonical
        )

        # All instances map to numeric IDs
        self.assertEqual(converted["wrapper"]["items"][0], ID("1"))
        self.assertEqual(converted["duplicate"], ID("1"))
        self.assertEqual(converted["wrapper"]["items"][1]["inner"], ID("2"))

        # Dict keys are transformed as well
        rewritten_keys = list(converted["wrapper"].keys())
        self.assertIn(ID("3"), rewritten_keys)

        # Mappings capture every canonical id exactly once
        self.assertEqual(self.canonical_to_temp[ID("canonical-1")], ID("1"))
        self.assertEqual(self.canonical_to_temp[ID("canonical-2")], ID("2"))
        self.assertEqual(self.canonical_to_temp[ID("canonical-3")], ID("3"))

    def test_convert_canonical_assigns_next_numeric_id(self) -> None:
        self.canonical_to_temp[ID("existing")] = ID("3")
        self.temp_to_canonical[ID("3")] = ID("existing")

        payload = {"nextId": ID("new")}

        result = convert_canonical_ids_to_temporary(
            payload, self.canonical_to_temp, self.temp_to_canonical
        )

        self.assertEqual(result["nextId"], ID("4"))
        self.assertEqual(self.canonical_to_temp[ID("new")], ID("4"))
        self.assertEqual(self.temp_to_canonical[ID("4")], ID("new"))

    def test_convert_temporary_rewrites_nested_payloads(self) -> None:
        self.temp_to_canonical[ID("1")] = ID("canonical-1")
        self.temp_to_canonical[ID("2")] = ID("canonical-2")

        payload = {
            "wrapper": [
                {"id": ID("1")},
                {ID("2"): [ID("1"), "keep"]},
            ]
        }

        converted = convert_temporary_ids_to_canonical(payload, self.temp_to_canonical)

        self.assertEqual(converted["wrapper"][0]["id"], ID("canonical-1"))
        nested_keys = list(converted["wrapper"][1].keys())
        self.assertIn(ID("canonical-2"), nested_keys)
        self.assertEqual(
            converted["wrapper"][1][ID("canonical-2")][0], ID("canonical-1")
        )

    def test_convert_temporary_raises_for_unknown_id(self) -> None:
        with self.assertRaises(IDDoesNotExist):
            convert_temporary_ids_to_canonical(
                {"id": ID("missing")}, self.temp_to_canonical
            )


if __name__ == "__main__":
    unittest.main()
