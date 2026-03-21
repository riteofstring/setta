#!/usr/bin/env python3

import argparse
import ast
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_OUTPUT_PATH = Path("tmp/backend-gap-hunt-candidates.md")
DEFAULT_MATRIX_PATH = Path(
    "docs/plans/go-backend-rewrite/backend-behavior-parity-matrix.md"
)
DEFAULT_TESTS_PATH = Path("tests")
DEFAULT_DOCS_PATH = Path("docs/reference")
EXCLUDED_TEST_PARTS = {"helpers", "fixtures", "start", "__pycache__"}
EXCLUDED_DOC_PARTS = {"dependencies"}
GO_OWNED_CALLER_TOKENS = (
    "frontend/src/",
    "frontend/tests/e2e/",
    "frontend/src/state/actions/",
    "frontend/src/components/",
)
RETAINED_API_TOKENS = (
    "backend/setta/api/",
    "SettaRunner",
    "SettaListener",
    "chat_toolkit",
    "setta.api.",
)
MAX_CANDIDATES_PER_FAMILY = 3
TEST_AREA_PRIORITIES = {
    "api": 78,
    "routers": 76,
    "mcp": 74,
    "share": 72,
    "websockets": 70,
    "project_state": 66,
    "auth": 66,
    "sessions": 64,
    "logging": 56,
    "code_gen": 54,
    "skills": 50,
}
DOC_PRIORITIES = {
    "view-modes": 78,
    "share-policy-flags": 78,
    "setta-realtime-behavior": 77,
    "param-sweeps": 77,
    "chat-toolkit": 75,
    "external-agents": 75,
    "project-chat-windowing": 74,
    "auth-and-sessions": 74,
    "urls-and-routes": 73,
    "json_source_sections": 72,
    "json_source_formats": 70,
    "codegen-targets": 69,
    "listener-flows": 69,
    "setta-listener-examples": 68,
    "setta-listener-hot-reload": 68,
    "emit_to_frontend": 68,
    "codegen-section-policy-and-metadata": 67,
    "watch-code": 66,
    "agentic-edges": 64,
    "state-machine-workflows": 64,
    "chat-sections": 64,
}


@dataclass(frozen=True)
class MatrixRow:
    row_id: str
    source_evidence: str
    go_impl: str
    go_tests: str
    transport_evidence: str
    status: str
    notes: str


@dataclass(frozen=True)
class SourceTest:
    path: str
    name: str
    line: int
    area: str


@dataclass(frozen=True)
class ReferenceDoc:
    path: str
    stem: str


@dataclass(frozen=True)
class Candidate:
    key: str
    title: str
    kind: str
    queue: str
    score: int
    why: str
    source_evidence: list[str]
    current_evidence: list[str]
    suggested_proof: str


@dataclass(frozen=True)
class CandidateReport:
    generated_at_utc: str
    git_head: str | None
    matrix_baseline: str | None
    matrix_target: str | None
    matrix_row_count: int
    status_counts: dict[str, int]
    go_owned_candidates: list[Candidate]
    known_recheck_candidates: list[Candidate]
    retained_boundary_candidates: list[Candidate]
    low_priority_divergence_candidates: list[Candidate]
    candidates: list[Candidate]
    uncited_tests: list[SourceTest]
    uncited_docs: list[ReferenceDoc]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build a deterministic candidate backlog for backend Go parity gap hunts."
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
        "--docs-path",
        type=Path,
        default=DEFAULT_DOCS_PATH,
        help="Path to docs/reference, relative to --repo-root by default.",
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
    parser.add_argument(
        "--limit",
        type=int,
        default=25,
        help="Maximum number of ranked candidates to include in the main list.",
    )
    return parser.parse_args()


def resolve_path(root: Path, path: Path) -> Path:
    if path.is_absolute():
        return path
    return root / path


def git_head(root: Path) -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_matrix_metadata(matrix_text: str) -> tuple[str | None, str | None]:
    baseline_match = re.search(r"Source baseline:\s*`([^`]+)`", matrix_text)
    target_match = re.search(r"Target head:\s*`([^`]+)`", matrix_text)
    baseline = baseline_match.group(1) if baseline_match else None
    target = target_match.group(1) if target_match else None
    return baseline, target


def split_markdown_row(line: str) -> list[str]:
    if not line.startswith("|"):
        return []
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator_row(cells: list[str]) -> bool:
    if not cells:
        return False
    return all(set(cell) <= {"-", " ", ":"} for cell in cells)


def parse_matrix_rows(matrix_text: str) -> list[MatrixRow]:
    rows: list[MatrixRow] = []
    in_matrix = False
    for line in matrix_text.splitlines():
        if line.strip() == "## Matrix":
            in_matrix = True
            continue
        if not in_matrix:
            continue
        if not line.startswith("|"):
            continue
        cells = split_markdown_row(line)
        if len(cells) != 7:
            continue
        if cells[0] == "Row" or is_separator_row(cells):
            continue
        rows.append(
            MatrixRow(
                row_id=strip_inline_code(cells[0]),
                source_evidence=cells[1],
                go_impl=cells[2],
                go_tests=cells[3],
                transport_evidence=cells[4],
                status=strip_inline_code(cells[5]),
                notes=cells[6],
            )
        )
    return rows


def strip_inline_code(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("`") and stripped.endswith("`"):
        return stripped[1:-1]
    return stripped


def status_counts(rows: list[MatrixRow]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row.status] = counts.get(row.status, 0) + 1
    return counts


def collect_python_tests(tests_root: Path, repo_root_path: Path) -> list[SourceTest]:
    collected: list[SourceTest] = []
    for path in sorted(tests_root.rglob("test_*.py")):
        relative_path = path.relative_to(repo_root_path)
        if any(part in EXCLUDED_TEST_PARTS for part in relative_path.parts):
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


def collect_reference_docs(docs_root: Path, repo_root_path: Path) -> list[ReferenceDoc]:
    docs: list[ReferenceDoc] = []
    for path in sorted(docs_root.rglob("*.md")):
        relative_path = path.relative_to(repo_root_path)
        if any(part in EXCLUDED_DOC_PARTS for part in relative_path.parts):
            continue
        if path.stem not in DOC_PRIORITIES:
            continue
        docs.append(
            ReferenceDoc(
                path=relative_path.as_posix(),
                stem=path.stem,
            )
        )
    return docs


def has_go_owned_caller_signal(text: str) -> bool:
    return any(token in text for token in GO_OWNED_CALLER_TOKENS)


def has_retained_api_signal(text: str) -> bool:
    return any(token in text for token in RETAINED_API_TOKENS)


def count_go_test_references(text: str) -> int:
    go_tests = len(re.findall(r"\bTest[A-Z][A-Za-z0-9_]+\b", text))
    parity_refs = len(re.findall(r"scripts/backend-differential-parity[^;| ]*", text))
    return go_tests + parity_refs


def has_differential_scenario(text: str) -> bool:
    return "scripts/backend-differential-parity" in text


def build_status_row_candidates(rows: list[MatrixRow]) -> list[Candidate]:
    candidates: list[Candidate] = []
    base_scores = {
        "Implemented, proof incomplete": 96,
        "Retained Python boundary": 36,
        "Intentional divergence": 22,
        "Dormant / unproven caller": 46,
    }
    for row in rows:
        if row.status not in base_scores:
            continue
        text = " ".join(
            [
                row.source_evidence,
                row.go_tests,
                row.transport_evidence,
                row.notes,
            ]
        )
        score = base_scores[row.status]
        go_owned_caller = has_go_owned_caller_signal(row.transport_evidence)
        retained_api = has_retained_api_signal(text)
        if go_owned_caller:
            score += 18
        if retained_api:
            score += 12
        if not has_differential_scenario(row.go_tests):
            score += 6
        queue = "go-owned-gap"
        if row.status == "Retained Python boundary":
            queue = "retained-boundary-audit"
        if row.status == "Dormant / unproven caller":
            queue = "known-gap-recheck"
        if row.status == "Intentional divergence":
            queue = "low-priority-divergence"
        candidates.append(
            Candidate(
                key=f"matrix-status:{row.row_id}",
                title=row.row_id,
                kind="matrix-status-revisit",
                queue=queue,
                score=score,
                why=status_candidate_reason(row),
                source_evidence=[row.source_evidence],
                current_evidence=[
                    f"Status: {row.status}",
                    row.transport_evidence,
                ],
                suggested_proof=suggested_proof_for_status_row(row),
            )
        )
    return candidates


def status_candidate_reason(row: MatrixRow) -> str:
    if row.status == "Implemented, proof incomplete":
        return (
            "The matrix already records incomplete proof. This is a high-value "
            "candidate for a narrow executable slice."
        )
    if row.status == "Retained Python boundary":
        return (
            "The row is still classified as retained Python. Re-audit it when a "
            "live caller or retained public API still depends on the behavior."
        )
    if row.status == "Intentional divergence":
        return (
            "The row is classified as an intentional divergence. Revalidate it "
            "when current callers still touch that surface."
        )
    return (
        "The row is marked dormant or unproven. Verify that the caller really is "
        "dormant before trusting the classification."
    )


def suggested_proof_for_status_row(row: MatrixRow) -> str:
    joined = " ".join([row.source_evidence, row.transport_evidence, row.notes])
    if has_retained_api_signal(joined):
        return (
            "Add a retained-boundary proof slice: a focused retained API test or "
            "a differential parity scenario that exercises the public Python API "
            "surface directly."
        )
    if has_go_owned_caller_signal(row.transport_evidence):
        return (
            "Add a caller-visible proof slice: a targeted differential parity "
            "scenario or focused transport test on the live route/websocket path."
        )
    return (
        "Verify caller liveness first, then add the narrowest runtime or "
        "transport proof that can fail on current HEAD."
    )


def build_weak_proof_candidates(rows: list[MatrixRow]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for row in rows:
        if row.status != "Proved":
            continue
        if not has_go_owned_caller_signal(row.transport_evidence):
            continue
        if has_differential_scenario(row.go_tests):
            continue
        proof_count = count_go_test_references(row.go_tests)
        if proof_count > 1:
            continue
        score = 86
        if has_retained_api_signal(" ".join([row.source_evidence, row.transport_evidence])):
            score += 8
        candidates.append(
            Candidate(
                key=f"weak-proof:{row.row_id}",
                title=row.row_id,
                kind="weak-proof-row",
                queue="go-owned-gap",
                score=score,
                why=(
                    "This row is marked proved on a live caller surface, but the "
                    "recorded proof is narrow and does not cite a differential "
                    "parity scenario."
                ),
                source_evidence=[row.source_evidence],
                current_evidence=[
                    row.transport_evidence,
                    f"Recorded Go proof count: {proof_count}",
                ],
                suggested_proof=(
                    "Add a targeted differential parity scenario or a focused "
                    "transport/realtime test that exercises the caller-visible "
                    "contract end to end."
                ),
            )
        )
    return candidates


def build_unmapped_test_candidates(
    tests: list[SourceTest],
    matrix_text: str,
) -> tuple[list[Candidate], list[SourceTest]]:
    candidates: list[Candidate] = []
    uncited_tests: list[SourceTest] = []
    for test_ref in tests:
        if test_is_narrowly_cited(matrix_text, test_ref):
            continue
        uncited_tests.append(test_ref)
        score = TEST_AREA_PRIORITIES.get(test_ref.area, 48)
        if test_ref.area in {"api", "routers", "mcp", "share", "websockets"}:
            score += 8
        if "runner" in test_ref.path or "listener" in test_ref.path:
            score += 6
        if "realtime" in test_ref.path or "websocket" in test_ref.path:
            score += 4
        candidates.append(
            Candidate(
                key=f"test:{test_ref.path}::{test_ref.name}",
                title=f"{test_ref.path}::{test_ref.name}",
                kind="uncited-source-test",
                queue="go-owned-gap",
                score=score,
                why=(
                    "This exact source test is not cited narrowly in the parity "
                    "matrix, so it is a good candidate for a new row or a "
                    "stronger proof slice."
                ),
                source_evidence=[f"{test_ref.path}:{test_ref.line}"],
                current_evidence=[f"Area: tests/{test_ref.area}"],
                suggested_proof=suggested_proof_for_test_area(test_ref.area),
            )
        )
    return candidates, uncited_tests


def test_is_narrowly_cited(matrix_text: str, test_ref: SourceTest) -> bool:
    direct_ref = re.escape(f"{test_ref.path}::{test_ref.name}")
    grouped_ref = (
        re.escape(f"{test_ref.path}::")
        + r"(?:\{[^}]*\b"
        + re.escape(test_ref.name)
        + r"\b[^}]*\})"
    )
    return bool(re.search(direct_ref, matrix_text)) or bool(
        re.search(grouped_ref, matrix_text)
    )


def suggested_proof_for_test_area(area: str) -> str:
    if area in {"api", "routers", "mcp", "share", "websockets"}:
        return (
            "Add a narrow route or websocket proof slice first: targeted "
            "differential parity if the surface is live, otherwise a focused "
            "transport test plus a new matrix row."
        )
    if area in {"project_state", "code_gen"}:
        return (
            "Add a narrow runtime proof slice first, then layer transport proof "
            "only if a current caller depends on the behavior."
        )
    return (
        "Start with a focused source-to-Go proof slice and only widen to "
        "differential parity if the behavior is caller-visible."
    )


def build_unmapped_doc_candidates(
    docs: list[ReferenceDoc],
    matrix_text: str,
) -> tuple[list[Candidate], list[ReferenceDoc]]:
    candidates: list[Candidate] = []
    uncited_docs: list[ReferenceDoc] = []
    for doc_ref in docs:
        if doc_ref.path in matrix_text:
            continue
        uncited_docs.append(doc_ref)
        score = DOC_PRIORITIES.get(doc_ref.stem, 46)
        candidates.append(
            Candidate(
                key=f"doc:{doc_ref.path}",
                title=doc_ref.path,
                kind="uncited-reference-doc",
                queue="go-owned-gap",
                score=score,
                why=(
                    "This reference doc is not cited in the parity matrix, so it "
                    "may still contain backend contracts that were never turned "
                    "into executable proof."
                ),
                source_evidence=[doc_ref.path],
                current_evidence=["Reference doc not cited by the matrix"],
                suggested_proof=(
                    "Extract one concrete backend-owned contract from the doc and "
                    "add the narrowest proof slice that can fail on current HEAD."
                ),
            )
        )
    return candidates, uncited_docs


def dedupe_candidates(candidates: list[Candidate]) -> list[Candidate]:
    deduped: dict[str, Candidate] = {}
    for candidate in candidates:
        previous = deduped.get(candidate.key)
        if previous is None or candidate.score > previous.score:
            deduped[candidate.key] = candidate
    return list(deduped.values())


def matrix_candidate_family(title: str) -> str:
    parts = title.split(".")
    if not parts:
        return title
    if parts[0] == "chat_toolkit":
        return "chat_toolkit"
    if parts[0] == "listener" and len(parts) >= 2:
        return ".".join(parts[:2])
    if len(parts) >= 2:
        return ".".join(parts[:2])
    return parts[0]


def candidate_family(candidate: Candidate) -> str:
    if candidate.kind in {"matrix-status-revisit", "weak-proof-row"}:
        return f"row:{matrix_candidate_family(candidate.title)}"
    if candidate.kind == "uncited-source-test":
        return f"test:{Path(candidate.title.split('::', 1)[0]).stem}"
    if candidate.kind == "uncited-reference-doc":
        return f"doc:{Path(candidate.title).stem}"
    return f"{candidate.kind}:{candidate.title}"


def candidate_kind_priority(candidate: Candidate) -> int:
    if candidate.kind == "weak-proof-row":
        return 0
    if candidate.kind == "uncited-source-test":
        return 1
    if candidate.kind == "matrix-status-revisit":
        return 2
    if candidate.kind == "uncited-reference-doc":
        return 3
    return 4


def rank_candidates(candidates: list[Candidate], limit: int) -> list[Candidate]:
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            -candidate.score,
            candidate_kind_priority(candidate),
            candidate.title,
        ),
    )
    selected: list[Candidate] = []
    family_counts: dict[str, int] = {}
    for candidate in ranked:
        family = candidate_family(candidate)
        if family_counts.get(family, 0) >= MAX_CANDIDATES_PER_FAMILY:
            continue
        selected.append(candidate)
        family_counts[family] = family_counts.get(family, 0) + 1
        if len(selected) >= limit:
            break
    return selected


def retained_audit_limit(limit: int) -> int:
    if limit <= 1:
        return 1
    return max(3, min(10, limit // 2))


def low_priority_divergence_limit(limit: int) -> int:
    if limit <= 2:
        return 1
    return max(2, min(5, limit // 5))


def generate_report(
    repo_root_path: Path,
    matrix_path: Path,
    tests_path: Path,
    docs_path: Path,
    limit: int,
) -> CandidateReport:
    matrix_text = load_text(matrix_path)
    rows = parse_matrix_rows(matrix_text)
    baseline, matrix_target = parse_matrix_metadata(matrix_text)
    tests = collect_python_tests(tests_path, repo_root_path)
    docs = collect_reference_docs(docs_path, repo_root_path)

    status_candidates = build_status_row_candidates(rows)
    weak_proof_candidates = build_weak_proof_candidates(rows)
    unmapped_test_candidates, uncited_tests = build_unmapped_test_candidates(
        tests, matrix_text
    )
    unmapped_doc_candidates, uncited_docs = build_unmapped_doc_candidates(
        docs, matrix_text
    )
    deduped = dedupe_candidates(
        status_candidates
        + weak_proof_candidates
        + unmapped_test_candidates
        + unmapped_doc_candidates,
    )
    go_owned_candidates = rank_candidates(
        [candidate for candidate in deduped if candidate.queue == "go-owned-gap"],
        limit=limit,
    )
    known_recheck_candidates = rank_candidates(
        [candidate for candidate in deduped if candidate.queue == "known-gap-recheck"],
        limit=retained_audit_limit(limit),
    )
    retained_boundary_candidates = rank_candidates(
        [
            candidate
            for candidate in deduped
            if candidate.queue == "retained-boundary-audit"
        ],
        limit=retained_audit_limit(limit),
    )
    low_priority_divergence_candidates = rank_candidates(
        [
            candidate
            for candidate in deduped
            if candidate.queue == "low-priority-divergence"
        ],
        limit=low_priority_divergence_limit(limit),
    )

    return CandidateReport(
        generated_at_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
        git_head=git_head(repo_root_path),
        matrix_baseline=baseline,
        matrix_target=matrix_target,
        matrix_row_count=len(rows),
        status_counts=status_counts(rows),
        go_owned_candidates=go_owned_candidates,
        known_recheck_candidates=known_recheck_candidates,
        retained_boundary_candidates=retained_boundary_candidates,
        low_priority_divergence_candidates=low_priority_divergence_candidates,
        candidates=(
            go_owned_candidates
            + known_recheck_candidates
            + retained_boundary_candidates
            + low_priority_divergence_candidates
        ),
        uncited_tests=sorted(
            uncited_tests,
            key=lambda test_ref: (
                -TEST_AREA_PRIORITIES.get(test_ref.area, 48),
                test_ref.path,
                test_ref.name,
            ),
        ),
        uncited_docs=sorted(
            uncited_docs,
            key=lambda doc_ref: (-DOC_PRIORITIES.get(doc_ref.stem, 46), doc_ref.path),
        ),
    )


def render_report(report: CandidateReport) -> str:
    lines = [
        "# Backend Gap Hunt Candidates",
        "",
        f"- Generated: `{report.generated_at_utc}`",
        f"- Git HEAD: `{report.git_head or 'unknown'}`",
        (
            f"- Matrix source baseline: `{report.matrix_baseline}`"
            if report.matrix_baseline
            else "- Matrix source baseline: unavailable"
        ),
        (
            f"- Matrix target head: `{report.matrix_target}`"
            if report.matrix_target
            else "- Matrix target head: unavailable"
        ),
        "",
        "## Summary",
        "",
        f"- Matrix rows parsed: `{report.matrix_row_count}`",
    ]
    for status, count in sorted(report.status_counts.items()):
        lines.append(f"- Matrix status `{status}`: `{count}`")
    lines.extend(
        [
            f"- Uncited source tests: `{len(report.uncited_tests)}`",
            f"- Uncited reference docs: `{len(report.uncited_docs)}`",
            "",
            "## Unknown Go Gap Leads",
            "",
        ]
    )
    if not report.go_owned_candidates:
        lines.append("- None in this run.")
        lines.append("")

    for index, candidate in enumerate(report.go_owned_candidates, start=1):
        lines.append(
            f"{index}. `[score {candidate.score}]` `{candidate.kind}` `{candidate.title}`"
        )
        lines.append(f"   Why: {candidate.why}")
        if candidate.source_evidence:
            lines.append(
                "   Source evidence: " + "; ".join(candidate.source_evidence)
            )
        if candidate.current_evidence:
            lines.append(
                "   Current evidence: " + "; ".join(candidate.current_evidence)
            )
        lines.append(f"   Suggested next proof: {candidate.suggested_proof}")
        lines.append("")

    lines.extend(
        [
            "## Caller-Liveness Rechecks",
            "",
        ]
    )
    if not report.known_recheck_candidates:
        lines.append("- None in this run.")
        lines.append("")

    for index, candidate in enumerate(report.known_recheck_candidates, start=1):
        lines.append(
            f"{index}. `[score {candidate.score}]` `{candidate.kind}` `{candidate.title}`"
        )
        lines.append(f"   Why: {candidate.why}")
        if candidate.source_evidence:
            lines.append(
                "   Source evidence: " + "; ".join(candidate.source_evidence)
            )
        if candidate.current_evidence:
            lines.append(
                "   Current evidence: " + "; ".join(candidate.current_evidence)
            )
        lines.append(f"   Suggested next proof: {candidate.suggested_proof}")
        lines.append("")

    lines.extend(
        [
            "## Retained-Boundary Audits",
            "",
        ]
    )
    if not report.retained_boundary_candidates:
        lines.append("- None in this run.")
        lines.append("")

    for index, candidate in enumerate(report.retained_boundary_candidates, start=1):
        lines.append(
            f"{index}. `[score {candidate.score}]` `{candidate.kind}` `{candidate.title}`"
        )
        lines.append(f"   Why: {candidate.why}")
        if candidate.source_evidence:
            lines.append(
                "   Source evidence: " + "; ".join(candidate.source_evidence)
            )
        if candidate.current_evidence:
            lines.append(
                "   Current evidence: " + "; ".join(candidate.current_evidence)
            )
        lines.append(f"   Suggested next proof: {candidate.suggested_proof}")
        lines.append("")

    lines.extend(
        [
            "## Low-Priority Known Divergences",
            "",
        ]
    )
    if not report.low_priority_divergence_candidates:
        lines.append("- None in this run.")
        lines.append("")

    for index, candidate in enumerate(
        report.low_priority_divergence_candidates, start=1
    ):
        lines.append(
            f"{index}. `[score {candidate.score}]` `{candidate.kind}` `{candidate.title}`"
        )
        lines.append(f"   Why: {candidate.why}")
        if candidate.source_evidence:
            lines.append(
                "   Source evidence: " + "; ".join(candidate.source_evidence)
            )
        if candidate.current_evidence:
            lines.append(
                "   Current evidence: " + "; ".join(candidate.current_evidence)
            )
        lines.append(f"   Suggested next proof: {candidate.suggested_proof}")
        lines.append("")

    lines.extend(
        [
            "## Backlog Notes",
            "",
            "- Regenerate this file after matrix updates or when the active gap-hunt "
            "session exhausts the current top candidates.",
            "- Prefer working the unknown Go gap leads before known divergence "
            "rechecks, retained-boundary audits, or the low-priority known divergences.",
            "",
            "## Uncited Source Tests",
            "",
        ]
    )
    for test_ref in report.uncited_tests[:40]:
        lines.append(
            f"- `{test_ref.path}::{test_ref.name}` (area=`{test_ref.area}`, line `{test_ref.line}`)"
        )
    if len(report.uncited_tests) > 40:
        lines.append(f"- ... `{len(report.uncited_tests) - 40}` more")

    lines.extend(
        [
            "",
            "## Uncited Reference Docs",
            "",
        ]
    )
    for doc_ref in report.uncited_docs[:30]:
        lines.append(f"- `{doc_ref.path}`")
    if len(report.uncited_docs) > 30:
        lines.append(f"- ... `{len(report.uncited_docs) - 30}` more")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root_path = args.repo_root.resolve()
    matrix_path = resolve_path(repo_root_path, args.matrix_path)
    tests_path = resolve_path(repo_root_path, args.tests_path)
    docs_path = resolve_path(repo_root_path, args.docs_path)
    output_path = resolve_path(repo_root_path, args.output)

    report = generate_report(
        repo_root_path=repo_root_path,
        matrix_path=matrix_path,
        tests_path=tests_path,
        docs_path=docs_path,
        limit=args.limit,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_report(report), encoding="utf-8")
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
