import tempfile
from pathlib import Path

import pytest
from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.tools.file_read import read_file_range


class TestReadFileRangeTool:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.workspace_root = Path(self._temp_dir.name)
        file_path = self.workspace_root / "example.txt"
        file_path.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
        self.source_file = file_path.resolve()

        yield

        self._temp_dir.cleanup()

    def test_reads_entire_file_when_range_unspecified(self) -> None:
        result = read_file_range(path="example.txt", workspace_root=self.workspace_root)

        assert result["path"] == "example.txt"
        assert result["absolute_path"] == str(self.source_file)
        assert result["start_line"] == 1
        assert result["end_line"] == 3
        assert result["encoding"] == "utf-8"
        assert result["content"] == "alpha\nbeta\ngamma"

    def test_reads_specified_range(self) -> None:
        result = read_file_range(
            path="example.txt",
            start_line=2,
            end_line=3,
            workspace_root=self.workspace_root,
        )

        assert result["start_line"] == 2
        assert result["end_line"] == 3
        assert result["content"] == "beta\ngamma"

    def test_handles_start_beyond_end_of_file(self) -> None:
        result = read_file_range(
            path="example.txt",
            start_line=10,
            workspace_root=self.workspace_root,
        )

        assert result["start_line"] == 10
        assert result["end_line"] == 9
        assert result["content"] == ""

    def test_missing_file_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            read_file_range(path="missing.txt", workspace_root=self.workspace_root)

    def test_rejects_relative_escape_outside_workspace_root(self) -> None:
        with pytest.raises(InvalidToolArgumentsError, match="within the project root"):
            read_file_range(path="../outside.txt", workspace_root=self.workspace_root)

    def test_rejects_absolute_path_outside_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as outside_dir:
            outside_file = Path(outside_dir) / "outside.txt"
            outside_file.write_text("nope", encoding="utf-8")

            with pytest.raises(
                InvalidToolArgumentsError, match="within the project root"
            ):
                read_file_range(
                    path=str(outside_file),
                    workspace_root=self.workspace_root,
                )
