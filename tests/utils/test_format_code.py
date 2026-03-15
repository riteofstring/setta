import pytest

from setta.utils.format_code import ruff_format


def test_ruff_format_sorts_imports_and_formats_python() -> None:
    source = "import sys\nimport os\n\nprint( 1 + 2 )\n"

    formatted = ruff_format(source)

    assert formatted == "import os\nimport sys\n\nprint(1 + 2)\n"


def test_ruff_format_surfaces_ruff_error_text() -> None:
    with pytest.raises(RuntimeError, match="invalid-syntax"):
        ruff_format("def broken(:\n    pass\n")
