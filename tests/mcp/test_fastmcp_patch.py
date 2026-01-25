from typing import Annotated

import pytest
from mcp.server.fastmcp.utilities.func_metadata import func_metadata
from pydantic import Field
from setta.mcp.fastmcp_patch import apply_fastmcp_preparse_patch

class TestFastMCPPreparsePatch:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        apply_fastmcp_preparse_patch()

    def test_string_annotations_skip_json_preparse(self) -> None:
        def tool_handler(
            payload: dict[str, int],
            label: str,
            annotated_label: Annotated[str, Field(description="Displayed label")],
            optional_label: str | None,
        ) -> None:
            return None

        metadata = func_metadata(tool_handler)
        raw_data = {
            "payload": '{"value": 1}',
            "label": '{"value": 2}',
            "annotated_label": '{"value": 3}',
            "optional_label": '{"value": 4}',
        }

        parsed = metadata.pre_parse_json(raw_data)

        assert parsed["payload"] == {"value": 1}
        assert parsed["label"] == raw_data["label"]
        assert parsed["annotated_label"] == raw_data["annotated_label"]
        assert parsed["optional_label"] == raw_data["optional_label"]
