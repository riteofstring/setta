#!/usr/bin/env python3

import argparse
import ast
import re
import subprocess
import sys
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path


DEFAULT_OUTPUT_PATH = Path("tmp/backend-gap-hunt-candidates.md")
DEFAULT_MATRIX_PATH = Path(
    "docs/plans/go-backend-rewrite/backend-behavior-parity-matrix.md"
)
DEFAULT_TESTS_PATH = Path("tests")
EXCLUDED_TEST_PARTS = {"helpers", "fixtures", "__pycache__"}
EXCLUDED_TEST_PATH_GLOBS = {
    "tests/skills/*",
    "tests/start/test_*_script.py",
    "tests/start/test_*scripts.py",
    "tests/start/test_*script_wiring*.py",
}
EMPTY_SOURCE_TEST_DISPOSITION_BACKLOG_EXIT_CODE = 10
EMPTY_UNCITED_SOURCE_TESTS_EXIT_CODE = EMPTY_SOURCE_TEST_DISPOSITION_BACKLOG_EXIT_CODE
TEST_CODE_SPAN_PATTERN = re.compile(r"`([^`]+)`")
TEST_NAME_PATTERN = re.compile(r"\b(test_[A-Za-z0-9_]+)\b")
MARKDOWN_TABLE_SEPARATOR_PATTERN = re.compile(r"^:?-{3,}:?$")
SOURCE_BASELINE_PATTERN = re.compile(r"^- Source baseline: `([^`]+)`$", re.MULTILINE)
TERMINAL_DISPOSITION_STATUSES = {
    "Proved",
    "Retained Python boundary",
    "Intentional divergence",
    "Dormant / unproven caller",
}
JUSTIFIED_OMISSION_STATUSES = {
    "Retained Python boundary",
    "Intentional divergence",
    "Dormant / unproven caller",
}
PROOF_MODE_PATTERN = re.compile(r"\bproof-mode=([a-z0-9_-]+)\b")


@dataclass(frozen=True)
class SourceTest:
    path: str
    name: str
    line: int
    area: str


@dataclass(frozen=True)
class MatrixRow:
    row_id: str
    source: str
    go_tests: str
    status: str
    notes: str


@dataclass(frozen=True)
class ProofRequirement:
    path_glob: str
    test_name_glob: str | None
    required_proof_mode: str


@dataclass(frozen=True)
class SourceTestDispositionGap:
    source_test: SourceTest
    reason: str
    rows: tuple[str, ...]


class SourceBaselineInventoryError(RuntimeError):
    pass


STRICT_PROOF_REQUIREMENTS = (
    # Source tests that seed real repo `.env` keys and hit live providers must
    # not be "proved" only by hermetic local-provider tests.
    ProofRequirement(
        path_glob="tests/llm/test_llm_chat_manager_openai_integration.py",
        test_name_glob=None,
        required_proof_mode="live-provider",
    ),
    ProofRequirement(
        path_glob="tests/llm/test_llm_chat_manager_anthropic_integration.py",
        test_name_glob=None,
        required_proof_mode="live-provider",
    ),
    ProofRequirement(
        path_glob="tests/agentic/test_claude_sdk_adapter_integration.py",
        test_name_glob=None,
        required_proof_mode="live-provider",
    ),
    ProofRequirement(
        path_glob="tests/agentic/test_opencode_sdk_adapter_integration.py",
        test_name_glob=None,
        required_proof_mode="live-provider",
    ),
    ProofRequirement(
        path_glob="tests/agentic/test_codex_app_server_adapter_integration.py",
        test_name_glob=None,
        required_proof_mode="live-provider",
    ),
    # The launcher open-workspace success path is too easy to "prove" with
    # fake launchers or mocked frontend responses while still missing the real
    # browser-triggered runtime path.
    ProofRequirement(
        path_glob="tests/routers/test_launcher_home_routes.py",
        test_name_glob="test_open_launcher_workspace_returns_bootstrap_fragment",
        required_proof_mode="launcher-unmocked-transport",
    ),
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a source-test backlog for backend Go parity gap hunts. "
            "Every Python source test must have an explicit parity disposition "
            "in the matrix."
        )
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=repo_root(),
        help="Repository root. Defaults to the current repo.",
    )
    parser.add_argument(
        "--matrix-path",
        type=Path,
        default=DEFAULT_MATRIX_PATH,
        help="Path to the parity matrix, relative to --repo-root by default.",
    )
    parser.add_argument(
        "--tests-path",
        type=Path,
        default=DEFAULT_TESTS_PATH,
        help="Path to the Python tests root, relative to --repo-root by default.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help=(
            "Markdown output path, relative to --repo-root by default. "
            "Defaults to tmp/backend-gap-hunt-candidates.md."
        ),
    )
    return parser.parse_args()


def resolve_path(root: Path, path: Path) -> Path:
    if path.is_absolute():
        return path
    return root / path


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def normalize_matrix_cell(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("`") and stripped.endswith("`") and len(stripped) >= 2:
        return stripped[1:-1].strip()
    return stripped


def parse_markdown_table_row(line: str) -> list[str] | None:
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        return None
    cells: list[str] = []
    current_cell: list[str] = []
    inside_code_span = False
    for character in stripped[1:-1]:
        if character == "`":
            inside_code_span = not inside_code_span
            current_cell.append(character)
            continue
        if character == "|" and not inside_code_span:
            cells.append("".join(current_cell).strip())
            current_cell = []
            continue
        current_cell.append(character)
    cells.append("".join(current_cell).strip())
    return cells


def is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(
        MARKDOWN_TABLE_SEPARATOR_PATTERN.fullmatch(cell.strip()) is not None
        for cell in cells
    )


def collect_matrix_rows(matrix_text: str) -> list[MatrixRow]:
    rows: list[MatrixRow] = []
    in_matrix_table = False
    for line in matrix_text.splitlines():
        cells = parse_markdown_table_row(line)
        if cells is None:
            if in_matrix_table:
                break
            continue
        if not in_matrix_table:
            if cells == [
                "Row",
                "Source (`26e7406b`)",
                "Go impl",
                "Go tests",
                "Transport / caller evidence",
                "Status",
                "Notes",
            ] or (
                len(cells) == 7
                and cells[0] == "Row"
                and cells[2:] == [
                    "Go impl",
                    "Go tests",
                    "Transport / caller evidence",
                    "Status",
                    "Notes",
                ]
            ):
                in_matrix_table = True
            continue
        if len(cells) != 7 or is_separator_row(cells):
            continue
        rows.append(
            MatrixRow(
                row_id=normalize_matrix_cell(cells[0]),
                source=cells[1],
                go_tests=cells[3],
                status=normalize_matrix_cell(cells[5]),
                notes=cells[6].strip(),
            )
        )
    return rows


def test_path_is_eligible(relative_path: Path) -> bool:
    if any(part in EXCLUDED_TEST_PARTS for part in relative_path.parts):
        return False
    relative_posix_path = relative_path.as_posix()
    return not any(
        fnmatch(relative_posix_path, pattern) for pattern in EXCLUDED_TEST_PATH_GLOBS
    )


def collect_python_tests_from_module_text(
    relative_path: Path,
    module_text: str,
) -> list[SourceTest]:
    collected: list[SourceTest] = []
    module = ast.parse(module_text)
    area = relative_path.parts[1] if len(relative_path.parts) > 1 else "tests"
    for node in ast.walk(module):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            if not node.name.startswith("test_"):
                continue
            collected.append(
                SourceTest(
                    path=relative_path.as_posix(),
                    name=node.name,
                    line=node.lineno,
                    area=area,
                )
            )
    return collected


def parse_source_baseline_ref(matrix_text: str) -> str:
    match = SOURCE_BASELINE_PATTERN.search(matrix_text)
    if match is None:
        raise SourceBaselineInventoryError(
            "Parity matrix must declare a pinned `Source baseline: `...`` audit boundary."
        )
    baseline = match.group(1).strip()
    if "@" in baseline:
        baseline = baseline.rsplit("@", 1)[1].strip()
    if baseline == "":
        raise SourceBaselineInventoryError(
            "Parity matrix source baseline cannot be empty."
        )
    return baseline


def run_git(repo_root_path: Path, args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo_root_path,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def collect_python_tests_from_source_baseline(
    repo_root_path: Path,
    tests_root: Path,
    matrix_text: str,
) -> list[SourceTest]:
    source_baseline_ref = parse_source_baseline_ref(matrix_text)
    try:
        tests_root_relative = tests_root.relative_to(repo_root_path)
    except ValueError:
        raise SourceBaselineInventoryError(
            f"Tests path `{tests_root}` must live under repo root `{repo_root_path}`."
        ) from None
    try:
        tracked_paths_output = run_git(
            repo_root_path,
            [
                "ls-tree",
                "-r",
                "--name-only",
                source_baseline_ref,
                "--",
                tests_root_relative.as_posix(),
            ],
        )
        collected: list[SourceTest] = []
        for tracked_path in tracked_paths_output.splitlines():
            relative_path = Path(tracked_path.strip())
            if relative_path.name == "" or relative_path.suffix != ".py":
                continue
            if not relative_path.name.startswith("test_"):
                continue
            if not test_path_is_eligible(relative_path):
                continue
            collected.extend(
                collect_python_tests_from_module_text(
                    relative_path,
                    run_git(
                        repo_root_path,
                        ["show", f"{source_baseline_ref}:{relative_path.as_posix()}"],
                    ),
                )
            )
    except FileNotFoundError as exc:
        raise SourceBaselineInventoryError(
            "git is required to load the pinned source baseline test inventory."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise SourceBaselineInventoryError(
            "Unable to load pinned source baseline test inventory "
            f"from git ref `{source_baseline_ref}`."
        ) from exc
    return collected


def collect_matrix_test_citations(matrix_text: str) -> set[tuple[str, str]]:
    citations: set[tuple[str, str]] = set()
    for code_span in TEST_CODE_SPAN_PATTERN.findall(matrix_text):
        tests_path_start = code_span.find("tests/")
        if tests_path_start == -1 or "::" not in code_span:
            continue
        path, *scope_parts = code_span[tests_path_start:].split("::")
        if not path.endswith(".py") or not scope_parts:
            continue
        last_part = scope_parts[-1]
        if last_part.startswith("{") and last_part.endswith("}"):
            test_names = TEST_NAME_PATTERN.findall(last_part)
        elif last_part.startswith("test_"):
            test_names = [last_part]
        else:
            test_names = []
        for test_name in test_names:
            citations.add((path, test_name))
    return citations


def build_source_test_row_map(
    matrix_rows: list[MatrixRow],
) -> dict[tuple[str, str], list[MatrixRow]]:
    rows_by_test: dict[tuple[str, str], list[MatrixRow]] = {}
    for row in matrix_rows:
        for citation in collect_matrix_test_citations(row.source):
            rows_by_test.setdefault(citation, []).append(row)
    return rows_by_test


def row_has_explicit_go_proof(row: MatrixRow) -> bool:
    return normalize_matrix_cell(row.go_tests) not in {"", "-"}


def row_has_written_justification(row: MatrixRow) -> bool:
    return row.notes.strip() not in {"", "-"}


def row_declared_proof_modes(row: MatrixRow) -> set[str]:
    declared: set[str] = set()
    for text in (row.go_tests, row.notes):
        for match in PROOF_MODE_PATTERN.finditer(text):
            declared.add(match.group(1).strip())
    return declared


def required_proof_modes_for_test(source_test: SourceTest) -> tuple[str, ...]:
    required: list[str] = []
    for requirement in STRICT_PROOF_REQUIREMENTS:
        if not fnmatch(source_test.path, requirement.path_glob):
            continue
        if requirement.test_name_glob is not None and not fnmatch(
            source_test.name, requirement.test_name_glob
        ):
            continue
        required.append(requirement.required_proof_mode)
    return tuple(required)


def describe_rows(rows: list[MatrixRow]) -> tuple[str, ...]:
    return tuple(
        f"{row.row_id}:{row.status}"
        for row in sorted(rows, key=lambda matrix_row: (matrix_row.row_id, matrix_row.status))
    )


def disposition_gap_for_test(
    source_test: SourceTest,
    rows_by_test: dict[tuple[str, str], list[MatrixRow]],
) -> SourceTestDispositionGap | None:
    rows = rows_by_test.get((source_test.path, source_test.name), [])
    if not rows:
        return SourceTestDispositionGap(
            source_test=source_test,
            reason="missing_matrix_row",
            rows=(),
        )

    non_terminal_rows = [
        row for row in rows if row.status not in TERMINAL_DISPOSITION_STATUSES
    ]
    if non_terminal_rows:
        return SourceTestDispositionGap(
            source_test=source_test,
            reason="non_terminal_disposition",
            rows=describe_rows(non_terminal_rows),
        )

    proved_without_go_proof = [
        row for row in rows if row.status == "Proved" and not row_has_explicit_go_proof(row)
    ]
    if proved_without_go_proof:
        return SourceTestDispositionGap(
            source_test=source_test,
            reason="proved_without_go_proof",
            rows=describe_rows(proved_without_go_proof),
        )

    unjustified_omission_rows = [
        row
        for row in rows
        if row.status in JUSTIFIED_OMISSION_STATUSES
        and not row_has_written_justification(row)
    ]
    if unjustified_omission_rows:
        return SourceTestDispositionGap(
            source_test=source_test,
            reason="justified_omission_missing_notes",
            rows=describe_rows(unjustified_omission_rows),
        )

    for required_proof_mode in required_proof_modes_for_test(source_test):
        proved_without_required_proof_mode = [
            row
            for row in rows
            if row.status == "Proved"
            and required_proof_mode not in row_declared_proof_modes(row)
        ]
        if proved_without_required_proof_mode:
            return SourceTestDispositionGap(
                source_test=source_test,
                reason=f"proved_missing_{required_proof_mode}_proof_mode",
                rows=describe_rows(proved_without_required_proof_mode),
            )

    return None


def generate_report(
    repo_root_path: Path,
    matrix_path: Path,
    tests_path: Path,
) -> list[SourceTestDispositionGap]:
    matrix_text = load_text(matrix_path)
    matrix_rows = collect_matrix_rows(matrix_text)
    rows_by_test = build_source_test_row_map(matrix_rows)
    tests = collect_python_tests_from_source_baseline(
        repo_root_path=repo_root_path,
        tests_root=tests_path,
        matrix_text=matrix_text,
    )
    gaps = [
        disposition_gap
        for test_ref in tests
        if (disposition_gap := disposition_gap_for_test(test_ref, rows_by_test))
        is not None
    ]
    return sorted(
        gaps,
        key=lambda disposition_gap: (
            disposition_gap.source_test.path,
            disposition_gap.source_test.line,
            disposition_gap.source_test.name,
        ),
    )


def render_report(disposition_gaps: list[SourceTestDispositionGap]) -> str:
    lines = [
        "# Backend Gap Hunt Candidates",
        "",
        "## Source Tests Missing Explicit Parity Disposition",
        "",
    ]
    for disposition_gap in disposition_gaps:
        rows_suffix = ""
        if disposition_gap.rows:
            rows_suffix = f", rows=`{', '.join(disposition_gap.rows)}`"
        lines.append(
            "- "
            f"`{disposition_gap.source_test.path}::{disposition_gap.source_test.name}` "
            f"(area=`{disposition_gap.source_test.area}`, "
            f"line `{disposition_gap.source_test.line}`, "
            f"reason=`{disposition_gap.reason}`{rows_suffix})"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root_path = args.repo_root.resolve()
    matrix_path = resolve_path(repo_root_path, args.matrix_path)
    tests_path = resolve_path(repo_root_path, args.tests_path)
    output_path = resolve_path(repo_root_path, args.output)

    try:
        report = generate_report(
            repo_root_path=repo_root_path,
            matrix_path=matrix_path,
            tests_path=tests_path,
        )
    except SourceBaselineInventoryError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_report(report), encoding="utf-8")
    print(output_path)
    if report:
        return 0
    return EMPTY_SOURCE_TEST_DISPOSITION_BACKLOG_EXIT_CODE


if __name__ == "__main__":
    raise SystemExit(main())
