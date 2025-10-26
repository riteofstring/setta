import copy
import unittest

from backend.setta.api.listener import SettaListener


class SettaListenerUpdateStoredDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.listener = SettaListener()

        @self.listener.interactive(dependencies=[["projectState"]])
        def sample(data):
            return data

        self.fn = sample
        self.listener.fns = [self.fn]
        self.initial_state = {
            "projectConfigId": "default",
            "projectState": {
                "sections": {
                    "sectionA": {
                        "name": "Initial name",
                        "tags": [],
                    }
                }
            },
        }
        self.fn._setta_data = copy.deepcopy(self.initial_state)

    def test_update_stored_data_merges_nested_values(self) -> None:
        self.listener.update_stored_data(
            (["projectState", "sections", "sectionA", "name"], "Renamed"), self.fn
        )
        self.assertEqual(
            "Renamed",
            self.fn._setta_data["projectState"]["sections"]["sectionA"]["name"],
        )

        self.listener.update_stored_data(
            (["projectState", "sections", "sectionA", "tags"], ["alpha"]), self.fn
        )
        self.assertEqual(
            ["alpha"],
            self.fn._setta_data["projectState"]["sections"]["sectionA"]["tags"],
        )

        self.listener.update_stored_data(
            (["projectState", "sections", "sectionA", "tags", 1], "beta"), self.fn
        )
        self.assertEqual(
            ["alpha", "beta"],
            self.fn._setta_data["projectState"]["sections"]["sectionA"]["tags"],
        )

        self.fn._setta_is_running = True
        self.listener.update_stored_data(
            (["projectState", "sections", "sectionA", "name"], "Deferred"), self.fn
        )
        self.assertEqual(
            "Renamed",
            self.fn._setta_data["projectState"]["sections"]["sectionA"]["name"],
        )
        self.assertIn(
            ("projectState", "sections", "sectionA", "name"),
            self.fn._setta_data_to_be_updated,
        )

        deferred_updates = list(self.fn._setta_data_to_be_updated.items())
        self.fn._setta_is_running = False
        for key, value in deferred_updates:
            self.listener.update_stored_data((key, value), self.fn)
        self.assertEqual(
            "Deferred",
            self.fn._setta_data["projectState"]["sections"]["sectionA"]["name"],
        )

    def test_update_stored_data_raises_for_missing_path(self) -> None:
        with self.assertRaises(KeyError):
            self.listener.update_stored_data(
                (["projectState", "missingSection", "name"], "value"), self.fn
            )

