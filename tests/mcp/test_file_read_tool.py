import tempfile
import unittest
from pathlib import Path

from setta.mcp.tools.file_read import read_file_range


class ReadFileRangeToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self.workspace_root = Path(self._temp_dir.name)
        file_path = self.workspace_root / "example.txt"
        file_path.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
        self.source_file = file_path.resolve()

    def test_reads_entire_file_when_range_unspecified(self) -> None:
        result = read_file_range(path="example.txt", workspace_root=self.workspace_root)

        self.assertEqual(result["path"], "example.txt")
        self.assertEqual(result["absolute_path"], str(self.source_file))
        self.assertEqual(result["start_line"], 1)
        self.assertEqual(result["end_line"], 3)
        self.assertEqual(result["encoding"], "utf-8")
        self.assertEqual(result["content"], "alpha\nbeta\ngamma")

    def test_reads_specified_range(self) -> None:
        result = read_file_range(
            path="example.txt",
            start_line=2,
            end_line=3,
            workspace_root=self.workspace_root,
        )

        self.assertEqual(result["start_line"], 2)
        self.assertEqual(result["end_line"], 3)
        self.assertEqual(result["content"], "beta\ngamma")

    def test_handles_start_beyond_end_of_file(self) -> None:
        result = read_file_range(
            path="example.txt",
            start_line=10,
            workspace_root=self.workspace_root,
        )

        self.assertEqual(result["start_line"], 10)
        self.assertEqual(result["end_line"], 9)
        self.assertEqual(result["content"], "")

    def test_missing_file_raises(self) -> None:
        with self.assertRaises(FileNotFoundError):
            read_file_range(path="missing.txt", workspace_root=self.workspace_root)
