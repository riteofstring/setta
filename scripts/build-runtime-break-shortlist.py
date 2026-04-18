#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


FRONTEND_DIAGNOSTIC_RE = re.compile(
    r"^(src/[^(:]+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\): error TS(\d+): (.+)$"
)
PYTHON_DIAGNOSTIC_RE = re.compile(
    r"^([^:\n]+\.py):(\d+):(\d+):\s+(error|warning)(?:\[([^\]]+)\])?:\s+(.+)$"
)
GO_DIAGNOSTIC_RE = re.compile(r"^([A-Za-z0-9_./-]+\.go):(\d+):(\d+):\s+(.+)$")
EXPORT_RE = re.compile(
    r"^export\s+(?:declare\s+)?(?:type|const|function|class|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.MULTILINE,
)
ENUM_BLOCK_RE = re.compile(
    r"export const ([A-Za-z_][A-Za-z0-9_]*Enum)\s*=\s*{(.*?)}\s*as const;",
    re.DOTALL,
)
ENUM_MEMBER_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", re.MULTILINE)
GENERATED_TYPES_IMPORT_RE = re.compile(
    r'import\s*{([^}]*)}\s*from\s*"utils/generatedTypes";', re.DOTALL
)
ENUM_USAGE_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*Enum)\.([A-Za-z_][A-Za-z0-9_]*)\b")

RUNTIME_BREAK_TYPESCRIPT_CODES = {
    "2304",
    "2305",
    "2339",
    "2604",
    "2724",
    "2786",
}


@dataclass
class Finding:
    kind: str
    file_path: str
    line: int
    priority: int
    title: str
    why: str
    evidence: list[str] = field(default_factory=list)

    def add_evidence(self, item: str) -> None:
        if item in self.evidence:
            return
        if len(self.evidence) >= 6:
            return
        self.evidence.append(item)


def is_test_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    name = normalized.rsplit("/", 1)[-1]
    return any(
        marker in normalized
        for marker in (
            "/__tests__/",
            "/frontend/tests/",
            "/tests/",
        )
    ) or name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", "_test.go"))


def is_production_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    return (
        not is_test_path(normalized)
        and (
            normalized.startswith("frontend/src/")
            or normalized.startswith("internal/")
            or normalized.startswith("backend/setta/")
            or normalized.startswith("cmd/")
        )
    )


def relative_repo_path(repo_root: Path, path: Path) -> str:
    return path.resolve().relative_to(repo_root.resolve()).as_posix()


def add_bucket(
    buckets: dict[tuple[str, str], Finding],
    *,
    kind: str,
    file_path: str,
    line: int,
    priority: int,
    title: str,
    why: str,
    evidence: str,
) -> None:
    key = (kind, file_path)
    finding = buckets.get(key)
    if finding is None:
        finding = Finding(
            kind=kind,
            file_path=file_path,
            line=line,
            priority=priority,
            title=title,
            why=why,
        )
        buckets[key] = finding
    else:
        finding.line = min(finding.line, line)
        finding.priority = max(finding.priority, priority)
    finding.add_evidence(evidence)


def parse_generated_types(path: Path) -> tuple[set[str], dict[str, set[str]]]:
    if not path.is_file():
        return set(), {}
    text = path.read_text(encoding="utf-8")
    exports = set(EXPORT_RE.findall(text))
    enum_members: dict[str, set[str]] = {}
    for match in ENUM_BLOCK_RE.finditer(text):
        enum_name = match.group(1)
        members = set(ENUM_MEMBER_RE.findall(match.group(2)))
        enum_members[enum_name] = members
    return exports, enum_members


def parse_import_symbols(text: str) -> dict[str, set[str]]:
    imports: dict[str, set[str]] = {}
    for match in GENERATED_TYPES_IMPORT_RE.finditer(text):
        members = imports.setdefault("utils/generatedTypes", set())
        for raw_member in match.group(1).split(","):
            member = raw_member.strip()
            if not member:
                continue
            member = re.sub(r"^type\s+", "", member).strip()
            member = member.split(" as ", 1)[0].strip()
            if member:
                members.add(member)
    return imports


def parse_frontend_diagnostics(frontend_typecheck: Path, buckets: dict[tuple[str, str], Finding]) -> None:
    if not frontend_typecheck.is_file():
        return
    for raw_line in frontend_typecheck.read_text(encoding="utf-8", errors="replace").splitlines():
        match = FRONTEND_DIAGNOSTIC_RE.match(raw_line)
        if not match:
            continue
        rel_path, line_text, _, code, message = match.groups()
        file_path = f"frontend/{rel_path}"
        if not is_production_path(file_path) or code not in RUNTIME_BREAK_TYPESCRIPT_CODES:
            continue

        line = int(line_text)
        if code in {"2305", "2724"}:
            add_bucket(
                buckets,
                kind="missing-generated-export",
                file_path=file_path,
                line=line,
                priority=95,
                title="Missing imported/exported symbol in production code",
                why="Production code imports or references a generated symbol that does not exist, so the supported build path is broken.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )
            continue
        if code == "2304":
            add_bucket(
                buckets,
                kind="missing-runtime-symbol",
                file_path=file_path,
                line=line,
                priority=92,
                title="Missing runtime symbol in production code",
                why="Production code references a symbol that does not exist, which blocks the supported build path and usually indicates broken wiring.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )
            continue
        if code in {"2604", "2786"}:
            add_bucket(
                buckets,
                kind="invalid-jsx-component",
                file_path=file_path,
                line=line,
                priority=90,
                title="Production JSX resolves to an unusable component",
                why="A component is undefined or not callable as JSX in production code, which breaks the supported render path.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )
            continue
        if code == "2339" and (
            "does not exist on type '{ readonly" in message
            or "does not exist on type 'typeof import" in message
        ):
            add_bucket(
                buckets,
                kind="missing-generated-member",
                file_path=file_path,
                line=line,
                priority=98,
                title="Production code expects generated members that are missing",
                why="Generated members used by production code are absent, which strongly suggests broken contract wiring or missing dispatch keys.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )


def parse_python_diagnostics(python_typecheck: Path, buckets: dict[tuple[str, str], Finding]) -> None:
    if not python_typecheck.is_file():
        return
    for raw_line in python_typecheck.read_text(encoding="utf-8", errors="replace").splitlines():
        match = PYTHON_DIAGNOSTIC_RE.match(raw_line)
        if not match:
            continue
        file_path, line_text, _, severity, rule, message = match.groups()
        if severity != "error" or not is_production_path(file_path):
            continue
        lower_rule = (rule or "").lower()
        lower_message = message.lower()
        if not any(
            token in lower_rule or token in lower_message
            for token in (
                "undefined",
                "unresolved",
                "import",
                "attribute",
                "not defined",
                "cannot be imported",
                "has no attribute",
            )
        ):
            continue
        line = int(line_text)
        add_bucket(
            buckets,
            kind="python-runtime-symbol",
            file_path=file_path,
            line=line,
            priority=88,
            title="Python production code references missing imports or attributes",
            why="A missing import/name/attribute in production Python code is a concrete runtime or import-path failure.",
            evidence=f"{file_path}:{line} {severity}[{rule or 'unknown'}]: {message}",
        )


def parse_go_diagnostics(go_typecheck: Path, buckets: dict[tuple[str, str], Finding]) -> None:
    if not go_typecheck.is_file():
        return
    for raw_line in go_typecheck.read_text(encoding="utf-8", errors="replace").splitlines():
        match = GO_DIAGNOSTIC_RE.match(raw_line)
        if not match:
            continue
        file_path, line_text, _, message = match.groups()
        if not is_production_path(file_path):
            continue
        line = int(line_text)
        add_bucket(
            buckets,
            kind="go-build-break",
            file_path=file_path,
            line=line,
            priority=94,
            title="Go production file does not compile",
            why="A compile error in non-test Go code blocks the supported build and runtime path.",
            evidence=f"{file_path}:{line}: {message}",
        )


def scan_generated_type_contracts(repo_root: Path, buckets: dict[tuple[str, str], Finding]) -> None:
    generated_types_path = repo_root / "frontend/src/utils/generatedTypes.ts"
    exports, enum_members = parse_generated_types(generated_types_path)
    frontend_src = repo_root / "frontend/src"
    if not frontend_src.is_dir():
        return

    for path in frontend_src.rglob("*.[tj]s*"):
        if not path.is_file():
            continue
        relative_path = relative_repo_path(repo_root, path)
        if not is_production_path(relative_path) or relative_path == "frontend/src/utils/generatedTypes.ts":
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        imports = parse_import_symbols(text).get("utils/generatedTypes", set())
        for imported_symbol in sorted(imports):
            if imported_symbol in exports:
                continue
            line = 1
            import_match = GENERATED_TYPES_IMPORT_RE.search(text)
            if import_match is not None:
                line = text.count("\n", 0, import_match.start()) + 1
            add_bucket(
                buckets,
                kind="static-missing-generated-export",
                file_path=relative_path,
                line=line,
                priority=95,
                title="Production import requests a generated symbol that does not exist",
                why="A missing generated export in a production import block breaks the supported build path and often points to owner/generated drift.",
                evidence=f"{relative_path}:{line} imports `{imported_symbol}` from utils/generatedTypes, but that symbol is not exported there.",
            )

        for match in ENUM_USAGE_RE.finditer(text):
            enum_name, member_name = match.groups()
            if enum_name not in imports:
                continue
            defined_members = enum_members.get(enum_name)
            if not defined_members or member_name in defined_members:
                continue
            line = text.count("\n", 0, match.start()) + 1
            add_bucket(
                buckets,
                kind="static-missing-generated-enum-member",
                file_path=relative_path,
                line=line,
                priority=100,
                title="Production code uses generated enum members that are missing",
                why="A generated enum member used in production code is absent from the exported enum object, which breaks runtime dispatch or build-time wiring.",
                evidence=f"{relative_path}:{line} uses `{enum_name}.{member_name}`, but `{enum_name}` in frontend/src/utils/generatedTypes.ts does not export `{member_name}`.",
            )


def render_markdown(
    findings: list[Finding],
    *,
    output_path: Path,
    frontend_typecheck: Path | None,
    python_typecheck: Path | None,
    go_typecheck: Path | None,
) -> str:
    lines = [
        "# Runtime-Break Shortlist",
        "",
        "This shortlist intentionally keeps only high-signal production-path failures.",
        "Test-only noise and lower-signal helper/nullability churn are omitted on purpose.",
        "",
        "## Sources",
    ]

    if frontend_typecheck is not None:
        lines.append(f"- frontend typecheck: {frontend_typecheck}")
    if python_typecheck is not None:
        lines.append(f"- python typecheck: {python_typecheck}")
    if go_typecheck is not None:
        lines.append(f"- go typecheck: {go_typecheck}")
    lines.extend(
        [
            f"- generated at: {output_path}",
            "",
        ]
    )

    if not findings:
        lines.extend(
            [
                "## Result",
                "- No high-signal runtime-break findings matched the shortlist rules.",
                "- If the raw typecheck outputs still contain errors, treat that backlog as non-critical until a concrete production failure can be stated in the audit.",
            ]
        )
        return "\n".join(lines) + "\n"

    tier_labels = {
        "Tier 1": lambda priority: priority >= 98,
        "Tier 2": lambda priority: 92 <= priority < 98,
        "Tier 3": lambda priority: priority < 92,
    }

    for tier_name, predicate in tier_labels.items():
        tier_findings = [finding for finding in findings if predicate(finding.priority)]
        if not tier_findings:
            continue
        lines.extend([f"## {tier_name}", ""])
        for finding in tier_findings:
            lines.append(
                f"- {finding.file_path}:{finding.line} | {finding.kind} | {finding.title}"
            )
            lines.append(f"  Why: {finding.why}")
            for evidence in finding.evidence:
                lines.append(f"  Evidence: {evidence}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_shortlist(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    output_path = Path(args.output).resolve()
    frontend_typecheck = Path(args.frontend_typecheck).resolve() if args.frontend_typecheck else None
    python_typecheck = Path(args.python_typecheck).resolve() if args.python_typecheck else None
    go_typecheck = Path(args.go_typecheck).resolve() if args.go_typecheck else None

    buckets: dict[tuple[str, str], Finding] = {}
    if frontend_typecheck is not None:
        parse_frontend_diagnostics(frontend_typecheck, buckets)
    if python_typecheck is not None:
        parse_python_diagnostics(python_typecheck, buckets)
    if go_typecheck is not None:
        parse_go_diagnostics(go_typecheck, buckets)
    scan_generated_type_contracts(repo_root, buckets)

    findings = sorted(
        buckets.values(),
        key=lambda finding: (-finding.priority, finding.file_path, finding.line, finding.kind),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        render_markdown(
            findings,
            output_path=output_path,
            frontend_typecheck=frontend_typecheck,
            python_typecheck=python_typecheck,
            go_typecheck=go_typecheck,
        ),
        encoding="utf-8",
    )
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a filtered runtime-break shortlist from saved typecheck outputs."
    )
    parser.add_argument("--repo-root", required=True, help="Repository root path.")
    parser.add_argument("--output", required=True, help="Output markdown file path.")
    parser.add_argument("--frontend-typecheck", help="Saved frontend typecheck output.")
    parser.add_argument("--python-typecheck", help="Saved python typecheck output.")
    parser.add_argument("--go-typecheck", help="Saved Go typecheck output.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    return build_shortlist(parse_args(argv))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
