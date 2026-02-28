from pathlib import Path
from typing import Any

from mcp.server.fastmcp.server import Context

from setta.mcp.tool_setup import setta_init_tool
from setta.utils.paths import ensure_within_workspace_root, get_setta_paths


@setta_init_tool
def read_file_range(
    *,
    path: str,
    start_line: int | None = None,
    end_line: int | None = None,
    workspace_root: str | Path | None = None,
    ctx: Context | None = None,  # noqa: ARG001
) -> dict[str, Any]:
    """Return the requested line range from a UTF-8 text file."""
    file_path = _resolve_path(path, workspace_root)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if not file_path.is_file():
        raise ValueError(f"Path is not a file: {file_path}")

    resolved_start = _normalize_start_line(start_line)
    resolved_end = _normalize_end_line(end_line)
    if resolved_end is not None and resolved_end < resolved_start:
        raise ValueError("end_line must be greater than or equal to start_line")

    snippet_lines: list[str] = []
    realized_end_line = resolved_start - 1

    try:
        handle = file_path.open("r", encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"File is not UTF-8 encoded: {file_path}") from exc

    with handle:
        for line_number, raw_line in enumerate(handle, start=1):
            if line_number >= resolved_start and (
                resolved_end is None or line_number <= resolved_end
            ):
                snippet_lines.append(raw_line.rstrip("\r\n"))
                realized_end_line = line_number
            if resolved_end is not None and line_number >= resolved_end:
                break

    base = _workspace_root(workspace_root)
    relative_path = _relative_to_workspace(file_path, base)

    return {
        "path": relative_path,
        "absolute_path": str(file_path),
        "start_line": resolved_start,
        "end_line": realized_end_line,
        "encoding": "utf-8",
        "content": "\n".join(snippet_lines),
    }


def _normalize_start_line(start_line: int | None) -> int:
    if start_line is None:
        return 1
    if start_line < 1:
        raise ValueError("start_line must be at least 1")
    return start_line


def _normalize_end_line(end_line: int | None) -> int | None:
    if end_line is None:
        return None
    if end_line < 1:
        raise ValueError("end_line must be at least 1")
    return end_line


def _workspace_root(workspace_root: str | Path | None) -> Path:
    if workspace_root is None:
        return get_setta_paths().workspace_root
    return Path(workspace_root).resolve()


def _resolve_path(path: str, workspace_root: str | Path | None) -> Path:
    base = _workspace_root(workspace_root)
    candidate = Path(path)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (base / candidate).resolve()
    return ensure_within_workspace_root(resolved, label="path", workspace_root=base)


def _relative_to_workspace(file_path: Path, workspace_root: Path) -> str:
    try:
        return str(file_path.relative_to(workspace_root))
    except ValueError:
        return str(file_path)
