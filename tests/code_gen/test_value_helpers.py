import os
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.code_gen.python import value_helpers


def test_read_binary_value_uses_runtime_root_env() -> None:
    with TemporaryDirectory() as tmpdir:
        runtime_root = Path(tmpdir)
        binary_root = runtime_root / "binary"
        binary_root.mkdir(parents=True, exist_ok=True)
        content_id = "payload-id"
        expected = b"payload"
        (binary_root / content_id).write_bytes(expected)

        previous = os.environ.get("SETTA_RUNTIME_ROOT")
        os.environ["SETTA_RUNTIME_ROOT"] = str(runtime_root)
        try:
            result = value_helpers.read_binary_value({"contentId": content_id})
        finally:
            if previous is None:
                os.environ.pop("SETTA_RUNTIME_ROOT", None)
            else:
                os.environ["SETTA_RUNTIME_ROOT"] = previous

        assert result == expected
