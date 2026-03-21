#!/usr/bin/env python3

import argparse
import ast
import re
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
EMPTY_UNCITED_SOURCE_TESTS_EXIT_CODE = 10
TEST_CODE_SPAN_PATTERN = re.compile(r"`([^`]+)`")
TEST_NAME_PATTERN = re.compile(r"\b(test_[A-Za-z0-9_]+)\b")


@dataclass(frozen=True)
class SourceTest:
    path: str
    name: str
    line: int
    area: str


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build an uncited-source-test backlog for backend Go parity gap hunts."
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


def test_path_is_eligible(relative_path: Path) -> bool:
    if any(part in EXCLUDED_TEST_PARTS for part in relative_path.parts):
        return False
    relative_posix_path = relative_path.as_posix()
    return not any(
        fnmatch(relative_posix_path, pattern) for pattern in EXCLUDED_TEST_PATH_GLOBS
    )


def collect_python_tests(tests_root: Path, repo_root_path: Path) -> list[SourceTest]:
    collected: list[SourceTest] = []
    for path in sorted(tests_root.rglob("test_*.py")):
        relative_path = path.relative_to(repo_root_path)
        if not test_path_is_eligible(relative_path):
            continue
        module = ast.parse(load_text(path))
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


def collect_matrix_test_citations(matrix_text: str) -> set[tuple[str, str]]:
    citations: set[tuple[str, str]] = set()
    for code_span in TEST_CODE_SPAN_PATTERN.findall(matrix_text):
        if not code_span.startswith("tests/") or "::" not in code_span:
            continue
        path, *scope_parts = code_span.split("::")
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


def test_is_narrowly_cited(
    cited_tests: set[tuple[str, str]],
    test_ref: SourceTest,
) -> bool:
    return (test_ref.path, test_ref.name) in cited_tests


def generate_report(
    repo_root_path: Path,
    matrix_path: Path,
    tests_path: Path,
) -> list[SourceTest]:
    matrix_text = load_text(matrix_path)
    cited_tests = collect_matrix_test_citations(matrix_text)
    tests = collect_python_tests(tests_path, repo_root_path)
    return sorted(
        [
            test_ref
            for test_ref in tests
            if not test_is_narrowly_cited(cited_tests, test_ref)
        ],
        key=lambda test_ref: (test_ref.path, test_ref.line, test_ref.name),
    )


def render_report(uncited_tests: list[SourceTest]) -> str:
    lines = [
        "# Backend Gap Hunt Candidates",
        "",
        "## Uncited Source Tests",
        "",
    ]
    for test_ref in uncited_tests:
        lines.append(
            f"- `{test_ref.path}::{test_ref.name}` (area=`{test_ref.area}`, line `{test_ref.line}`)"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root_path = args.repo_root.resolve()
    matrix_path = resolve_path(repo_root_path, args.matrix_path)
    tests_path = resolve_path(repo_root_path, args.tests_path)
    output_path = resolve_path(repo_root_path, args.output)

    report = generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_path,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_report(report), encoding="utf-8")
    print(output_path)
    if report:
        return 0
    return EMPTY_UNCITED_SOURCE_TESTS_EXIT_CODE


if __name__ == "__main__":
    raise SystemExit(main())
