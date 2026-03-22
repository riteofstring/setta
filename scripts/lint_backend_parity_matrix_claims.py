#!/usr/bin/env python3

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import backend_gap_hunt_candidates as gap_hunt


PROOF_MODE_PATTERN = re.compile(r"\bproof-mode=([a-z0-9_-]+)\b")
EVIDENCE_TAGS_PATTERN = re.compile(r"\bevidence-tags=([a-z0-9_,-]+)\b")
GO_TEST_NAME_PATTERN = re.compile(r"\bTest[A-Za-z0-9_]+\b")
PARITY_EVIDENCE_COMMENT_PATTERN = re.compile(
    r"^\s*//\s*parity-evidence:\s*(.+?)\s*$"
)
GO_TEST_FUNC_PATTERN = re.compile(r"^\s*func\s+(Test[A-Za-z0-9_]+)\s*\(")


@dataclass(frozen=True)
class TestEvidence:
    file_path: str
    proof_mode: str
    evidence_tags: frozenset[str]


@dataclass(frozen=True)
class MatrixClaimFailure:
    row_id: str
    message: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate structured proof-mode claims in the backend parity matrix "
            "against annotated Go tests."
        )
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=gap_hunt.repo_root(),
        help="Repository root. Defaults to the current repo.",
    )
    parser.add_argument(
        "--matrix-path",
        type=Path,
        default=gap_hunt.DEFAULT_MATRIX_PATH,
        help="Path to the parity matrix, relative to --repo-root by default.",
    )
    return parser.parse_args()


def resolve_path(root: Path, path: Path) -> Path:
    if path.is_absolute():
        return path
    return root / path


def parse_single_proof_mode(text: str) -> str | None:
    modes = {match.group(1).strip() for match in PROOF_MODE_PATTERN.finditer(text)}
    if not modes:
        return None
    if len(modes) != 1:
        raise ValueError(f"expected at most one proof-mode, got {sorted(modes)}")
    return next(iter(modes))


def parse_evidence_tags(text: str) -> set[str]:
    tags: set[str] = set()
    for match in EVIDENCE_TAGS_PATTERN.finditer(text):
        for raw_tag in match.group(1).split(","):
            normalized = raw_tag.strip()
            if normalized:
                tags.add(normalized)
    return tags


def row_structured_proof_mode(row: gap_hunt.MatrixRow) -> str | None:
    combined = f"{row.go_tests}\n{row.notes}"
    return parse_single_proof_mode(combined)


def row_structured_evidence_tags(row: gap_hunt.MatrixRow) -> set[str]:
    return parse_evidence_tags(f"{row.go_tests}\n{row.notes}")


def row_cited_go_tests(row: gap_hunt.MatrixRow) -> set[str]:
    return set(GO_TEST_NAME_PATTERN.findall(row.go_tests))


def iter_go_test_files(repo_root: Path) -> list[Path]:
    files: list[Path] = []
    for path in repo_root.rglob("*_test.go"):
        relative_parts = path.relative_to(repo_root).parts
        if not relative_parts:
            continue
        if any(
            part.startswith(".")
            or part in {"backend", "frontend", "node_modules", "tmp", "tests", "setta_files"}
            for part in relative_parts
        ):
            continue
        files.append(path)
    return sorted(files)


def parse_test_evidence_comment(comment_text: str) -> TestEvidence:
    proof_mode = parse_single_proof_mode(comment_text)
    if proof_mode is None:
        raise ValueError("missing proof-mode in parity-evidence comment")
    evidence_tags = frozenset(parse_evidence_tags(comment_text))
    if not evidence_tags:
        raise ValueError("missing evidence-tags in parity-evidence comment")
    return TestEvidence(
        file_path="",
        proof_mode=proof_mode,
        evidence_tags=evidence_tags,
    )


def collect_go_test_evidence(repo_root: Path) -> dict[str, TestEvidence]:
    collected: dict[str, TestEvidence] = {}
    for path in iter_go_test_files(repo_root):
        pending_comment: str | None = None
        relative_path = path.relative_to(repo_root).as_posix()
        for line in path.read_text(encoding="utf-8").splitlines():
            comment_match = PARITY_EVIDENCE_COMMENT_PATTERN.match(line)
            if comment_match is not None:
                pending_comment = comment_match.group(1).strip()
                continue

            func_match = GO_TEST_FUNC_PATTERN.match(line)
            if func_match is not None and pending_comment is not None:
                parsed = parse_test_evidence_comment(pending_comment)
                test_name = func_match.group(1).strip()
                if test_name in collected:
                    raise ValueError(
                        f"duplicate parity-evidence annotation for {test_name}: "
                        f"{collected[test_name].file_path} and {relative_path}"
                    )
                collected[test_name] = TestEvidence(
                    file_path=relative_path,
                    proof_mode=parsed.proof_mode,
                    evidence_tags=parsed.evidence_tags,
                )
                pending_comment = None
                continue

            if line.strip() == "" or line.lstrip().startswith("//"):
                continue
            pending_comment = None

    return collected


def lint_matrix_claims(
    repo_root: Path,
    matrix_path: Path,
) -> list[MatrixClaimFailure]:
    matrix_text = matrix_path.read_text(encoding="utf-8")
    matrix_rows = gap_hunt.collect_matrix_rows(matrix_text)
    test_evidence_by_name = collect_go_test_evidence(repo_root)

    failures: list[MatrixClaimFailure] = []
    for row in matrix_rows:
        proof_mode = row_structured_proof_mode(row)
        evidence_tags = row_structured_evidence_tags(row)
        if proof_mode is None and not evidence_tags:
            continue

        if proof_mode is None:
            failures.append(
                MatrixClaimFailure(
                    row_id=row.row_id,
                    message="declares evidence-tags without proof-mode",
                )
            )
            continue

        if not evidence_tags:
            failures.append(
                MatrixClaimFailure(
                    row_id=row.row_id,
                    message=f"declares proof-mode={proof_mode} without evidence-tags",
                )
            )
            continue

        cited_go_tests = row_cited_go_tests(row)
        if not cited_go_tests:
            failures.append(
                MatrixClaimFailure(
                    row_id=row.row_id,
                    message=(
                        f"declares proof-mode={proof_mode} and evidence-tags="
                        f"{sorted(evidence_tags)} without citing Go tests"
                    ),
                )
            )
            continue

        matching_tests: list[TestEvidence] = []
        for test_name in sorted(cited_go_tests):
            evidence = test_evidence_by_name.get(test_name)
            if evidence is None:
                continue
            if evidence.proof_mode != proof_mode:
                continue
            matching_tests.append(evidence)

        if not matching_tests:
            failures.append(
                MatrixClaimFailure(
                    row_id=row.row_id,
                    message=(
                        f"declares proof-mode={proof_mode} but none of the cited Go tests "
                        "have matching parity-evidence annotations"
                    ),
                )
            )
            continue

        supported_tags: set[str] = set()
        for evidence in matching_tests:
            supported_tags.update(evidence.evidence_tags)

        missing_tags = sorted(evidence_tags - supported_tags)
        if missing_tags:
            failures.append(
                MatrixClaimFailure(
                    row_id=row.row_id,
                    message=(
                        f"claims evidence-tags={missing_tags} not backed by the cited "
                        f"{proof_mode} Go tests"
                    ),
                )
            )

    return failures


def format_failures(failures: list[MatrixClaimFailure]) -> str:
    lines = ["Backend parity matrix structured-proof lint failed:"]
    for failure in failures:
        lines.append(f"- {failure.row_id}: {failure.message}")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root = resolve_path(gap_hunt.repo_root(), args.repo_root)
    matrix_path = resolve_path(repo_root, args.matrix_path)

    failures = lint_matrix_claims(repo_root=repo_root, matrix_path=matrix_path)
    if failures:
        print(format_failures(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
