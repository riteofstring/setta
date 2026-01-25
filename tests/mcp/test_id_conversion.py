from dataclasses import dataclass

import pytest
from pydantic import BaseModel
from setta.mcp.utils import (
    IDDoesNotExist,
    convert_canonical_ids_to_temporary,
    convert_existing_canonical_ids_to_temporary,
    convert_temporary_ids_to_canonical,
)
from setta.types.id import ID

class TestIDConversion:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
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
        assert converted["wrapper"]["items"][0] == ID("1")
        assert converted["duplicate"] == ID("1")
        assert converted["wrapper"]["items"][1]["inner"] == ID("2")

        # Dict keys are transformed as well
        rewritten_keys = list(converted["wrapper"].keys())
        assert ID("3") in rewritten_keys

        # Mappings capture every canonical id exactly once
        assert self.canonical_to_temp[ID("canonical-1")] == ID("1")
        assert self.canonical_to_temp[ID("canonical-2")] == ID("2")
        assert self.canonical_to_temp[ID("canonical-3")] == ID("3")

    def test_convert_canonical_assigns_next_numeric_id(self) -> None:
        self.canonical_to_temp[ID("existing")] = ID("3")
        self.temp_to_canonical[ID("3")] = ID("existing")

        payload = {"nextId": ID("new")}

        result = convert_canonical_ids_to_temporary(
            payload, self.canonical_to_temp, self.temp_to_canonical
        )

        assert result["nextId"] == ID("4")
        assert self.canonical_to_temp[ID("new")] == ID("4")
        assert self.temp_to_canonical[ID("4")] == ID("new")

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

        assert converted["wrapper"][0]["id"] == ID("canonical-1")
        nested_keys = list(converted["wrapper"][1].keys())
        assert ID("canonical-2") in nested_keys
        assert (
            converted["wrapper"][1][ID("canonical-2")][0]
            == ID("canonical-1")
        )

    def test_convert_temporary_raises_for_unknown_id(self) -> None:
        with pytest.raises(IDDoesNotExist):
            convert_temporary_ids_to_canonical(
                {"id": ID("missing")}, self.temp_to_canonical
            )

    def test_conversion_handles_pydantic_models(self) -> None:
        class DummyModel(BaseModel):
            id: ID
            items: list[ID]

        payload = DummyModel(id=ID("AAA"), items=[ID("BBB")])

        converted = convert_canonical_ids_to_temporary(
            payload, self.canonical_to_temp, self.temp_to_canonical
        )

        assert isinstance(converted, DummyModel)
        assert converted.id == ID("1")
        assert converted.items == [ID("2")]
        # round-trip back to canonical IDs
        canonical = convert_temporary_ids_to_canonical(
            converted, self.temp_to_canonical
        )
        assert canonical.id == ID("AAA")
        assert canonical.items == [ID("BBB")]

    def test_conversion_handles_dataclasses(self) -> None:
        @dataclass(frozen=True)
        class DummyData:
            id: ID
            items: list[ID]

        payload = DummyData(id=ID("AAA"), items=[ID("BBB")])

        converted = convert_canonical_ids_to_temporary(
            payload, self.canonical_to_temp, self.temp_to_canonical
        )

        assert isinstance(converted, DummyData)
        assert converted.id == ID("1")
        assert converted.items == [ID("2")]

    def test_convert_existing_only_rewrites_known_ids(self) -> None:
        self.canonical_to_temp[ID("known")] = ID("42")
        payload = {
            "known": ID("known"),
            "unknown": ID("missing"),
        }

        converted = convert_existing_canonical_ids_to_temporary(
            payload,
            self.canonical_to_temp,
        )

        assert converted["known"] == ID("42")
        assert converted["unknown"] == ID("missing")
