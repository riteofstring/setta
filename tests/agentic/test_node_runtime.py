import os
from pathlib import Path

import pytest

from setta.agentic import node_runtime


class TestNodeRuntime:
    def test_resolve_node_command_prefers_explicit_path(self) -> None:
        assert node_runtime.resolve_node_command("  /custom/node  ") == "/custom/node"

    def test_resolve_node_command_uses_bundled_node(self) -> None:
        platform_tag = node_runtime.get_platform_tag()
        if platform_tag is None:
            pytest.skip("Unsupported platform")
        existing = node_runtime.get_bundled_node_path()
        if existing is not None:
            assert node_runtime.resolve_node_command(None) == str(existing)
            return

        vendor_root = node_runtime._NODE_VENDOR_ROOT / platform_tag
        binary_name = "node.exe" if os.name == "nt" else "node"
        node_path = vendor_root / binary_name

        vendor_root.mkdir(parents=True, exist_ok=True)
        node_path.write_text("stub")
        try:
            resolved = node_runtime.resolve_node_command(None)
            assert resolved == str(node_path)
        finally:
            _cleanup_path(node_path, vendor_root)


def _cleanup_path(node_path: Path, vendor_root: Path) -> None:
    if node_path.exists():
        node_path.unlink()
    try:
        vendor_root.rmdir()
    except OSError:
        return
