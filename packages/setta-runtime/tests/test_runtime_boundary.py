from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(TEST_ROOT / "packages" / "setta-runtime" / "scripts"))

from check_runtime_boundary import (
    MAX_PRODUCTION_COMPLEXITY,
    check_complexity,
    check_import_boundaries,
)


class RuntimeBoundaryCheckerTests(unittest.TestCase):
    def test_current_runtime_obeys_import_rule_and_complexity_ceiling(self) -> None:
        source_root = TEST_ROOT / "packages" / "setta-runtime" / "src"
        self.assertEqual(check_import_boundaries(source_root), [])
        self.assertEqual(check_complexity(source_root), [])

    def test_rejects_direct_root_import_of_an_app_implementation(self) -> None:
        with _fixture_source(
            {
                "setta/__init__.py": "",
                "setta/cli.py": "from setta.apps.python_canvas import PythonCanvasAdapter\n",
                "setta/apps/__init__.py": "",
                "setta/apps/python_canvas.py": "",
            }
        ) as source_root:
            findings = check_import_boundaries(source_root)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].rule, "architecture")
        self.assertIn("facade", findings[0].message)

    def test_rejects_app_dependency_on_root_dispatcher(self) -> None:
        with _fixture_source(
            {
                "setta/__init__.py": "",
                "setta/cli.py": "",
                "setta/apps/__init__.py": "",
                "setta/apps/fixture.py": "from setta.cli import run\n",
            }
        ) as source_root:
            findings = check_import_boundaries(source_root)
        self.assertEqual(len(findings), 1)
        self.assertIn("root dispatcher", findings[0].message)

    def test_rejects_function_over_documented_complexity_ceiling(self) -> None:
        decisions = "\n".join(
            f"    if flag_{index}: pass" for index in range(MAX_PRODUCTION_COMPLEXITY)
        )
        with _fixture_source(
            {
                "setta/__init__.py": "",
                "setta/fixture.py": f"def too_complex():\n{decisions}\n",
            }
        ) as source_root:
            findings = check_complexity(source_root)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].rule, "complexity")
        self.assertIn(str(MAX_PRODUCTION_COMPLEXITY + 1), findings[0].message)


class _fixture_source:
    def __init__(self, files: dict[str, str]):
        self._files = files
        self._temporary: tempfile.TemporaryDirectory[str] | None = None

    def __enter__(self) -> Path:
        self._temporary = tempfile.TemporaryDirectory()
        root = Path(self._temporary.name) / "src"
        for relative, content in self._files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return root

    def __exit__(self, *_arguments: object) -> None:
        assert self._temporary is not None
        self._temporary.cleanup()
