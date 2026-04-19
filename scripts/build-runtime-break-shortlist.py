#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

FRONTEND_DIAGNOSTIC_RE = re.compile(
    r"^(src/[^(:]+\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\): error TS(\d+): (.+)$"
)
NAMED_IMPORT_RE = re.compile(
    r'import\s+(type\s+)?(?:[^;{}]+,\s*)?\{([^}]*)\}\s*from\s*["\']([^"\']+)["\'];?',
    re.DOTALL,
)
ENUM_BLOCK_RE = re.compile(
    r"export const ([A-Za-z_][A-Za-z0-9_]*Enum)\s*=\s*{(.*?)}\s*as const;",
    re.DOTALL,
)
ENUM_MEMBER_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", re.MULTILINE)
GENERATED_TYPES_IMPORT_RE = re.compile(
    r'import\s*{([^}]*)}\s*from\s*"utils/generatedTypes";', re.DOTALL
)
ENUM_USAGE_RE = re.compile(
    r"\b([A-Za-z_][A-Za-z0-9_]*Enum)\.([A-Za-z_][A-Za-z0-9_]*)\b"
)
MISSING_EXPORT_RE = re.compile(
    r"""^Module\s+['"]+([^'"]+)['"]+\s+has no exported member\s+['"]+([A-Za-z_][A-Za-z0-9_]*)['"]+\.(?: .+)?$"""
)
MISSING_NAMED_EXPORT_RE = re.compile(
    r"""^['"]+([^'"]+)['"]+\s+has no exported member named\s+['"]+([A-Za-z_][A-Za-z0-9_]*)['"]+\.(?: .+)?$"""
)
LOCAL_NOT_EXPORTED_RE = re.compile(
    r"""^Module\s+['"]+([^'"]+)['"]+\s+declares\s+['"]+([A-Za-z_][A-Za-z0-9_]*)['"]+\s+locally, but it is not exported\.$"""
)
CANNOT_FIND_NAME_RE = re.compile(
    r"""^Cannot find name ['"]([A-Za-z_][A-Za-z0-9_]*)['"]\.(?: .+)?$"""
)

RUNTIME_BREAK_TYPESCRIPT_CODES = {"2304", "2305", "2339", "2459", "2614", "2724"}
LOCAL_FRONTEND_MODULE_PREFIXES = (
    "components/",
    "forks/",
    "openapi/",
    "plugins/",
    "state/",
    "utils/",
)


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
    return not is_test_path(normalized) and (
        normalized.startswith("frontend/src/")
        or normalized.startswith("internal/")
        or normalized.startswith("backend/setta/")
        or normalized.startswith("cmd/")
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


def parse_generated_types(path: Path) -> dict[str, set[str]]:
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    enum_members: dict[str, set[str]] = {}
    for match in ENUM_BLOCK_RE.finditer(text):
        enum_name = match.group(1)
        members = set(ENUM_MEMBER_RE.findall(match.group(2)))
        enum_members[enum_name] = members
    return enum_members


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


def parse_named_imports(text: str) -> dict[str, dict[str, bool]]:
    imports: dict[str, dict[str, bool]] = {}
    for whole_type, members_text, module_path in NAMED_IMPORT_RE.findall(text):
        module_members = imports.setdefault(module_path, {})
        all_type_only = bool(whole_type)
        for raw_member in members_text.split(","):
            member = raw_member.strip()
            if not member:
                continue
            is_type_only = all_type_only
            if member.startswith("type "):
                is_type_only = True
                member = member[len("type ") :].strip()
            member = member.split(" as ", 1)[0].strip()
            if not member:
                continue
            module_members.setdefault(member, False)
            if not is_type_only:
                module_members[member] = True
    return imports


def transpile_frontend_source(repo_root: Path, source_path: Path) -> str | None:
    frontend_dir = repo_root / "frontend"
    transpile_script = """
const fs = require("fs");
const ts = require("typescript");
const sourcePath = process.argv[1];
const source = fs.readFileSync(sourcePath, "utf8");
const result = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    preserveValueImports: false,
  },
});
process.stdout.write(result.outputText);
"""
    try:
        completed = subprocess.run(
            ["node", "-e", transpile_script, str(source_path)],
            cwd=frontend_dir,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return completed.stdout


def load_transpiled_frontend_source(
    transpiled_source_cache: dict[str, str | None],
    *,
    repo_root: Path,
    file_path: str,
    source_path: Path,
) -> str | None:
    if file_path not in transpiled_source_cache:
        transpiled_source_cache[file_path] = transpile_frontend_source(
            repo_root, source_path
        )
    return transpiled_source_cache[file_path]


def is_frontend_local_module(module_path: str) -> bool:
    return module_path.startswith(".") or module_path.startswith(
        LOCAL_FRONTEND_MODULE_PREFIXES
    )


def missing_name_symbol(message: str) -> str | None:
    match = CANNOT_FIND_NAME_RE.match(message)
    if match:
        return match.group(1)
    return None


def missing_export_details(message: str) -> tuple[str, str] | None:
    for pattern in (MISSING_EXPORT_RE, MISSING_NAMED_EXPORT_RE, LOCAL_NOT_EXPORTED_RE):
        match = pattern.match(message)
        if match:
            return match.group(1), match.group(2)
    return None


def load_named_imports_for_source(
    import_cache: dict[str, dict[str, dict[str, bool]]],
    *,
    file_path: str,
    source_path: Path,
) -> dict[str, dict[str, bool]] | None:
    imports = import_cache.get(file_path)
    if imports is not None:
        return imports
    if not source_path.is_file():
        import_cache[file_path] = {}
        return None
    imports = parse_named_imports(source_path.read_text(encoding="utf-8", errors="replace"))
    import_cache[file_path] = imports
    return imports


def missing_export_survives_js_emit(
    emitted_import_cache: dict[str, dict[str, dict[str, bool]] | None],
    transpiled_source_cache: dict[str, str | None],
    *,
    repo_root: Path,
    file_path: str,
    source_path: Path,
    module_path: str,
    symbol: str,
) -> bool:
    emitted_imports = emitted_import_cache.get(file_path)
    if emitted_imports is None and file_path not in emitted_import_cache:
        output_text = load_transpiled_frontend_source(
            transpiled_source_cache,
            repo_root=repo_root,
            file_path=file_path,
            source_path=source_path,
        )
        emitted_imports = (
            parse_named_imports(output_text) if output_text is not None else None
        )
        emitted_import_cache[file_path] = emitted_imports
    else:
        emitted_imports = emitted_import_cache.get(file_path)
    if emitted_imports is None:
        return True
    return emitted_imports.get(module_path, {}).get(symbol, False)


def missing_name_survives_js_emit(
    transpiled_source_cache: dict[str, str | None],
    *,
    repo_root: Path,
    file_path: str,
    source_path: Path,
    symbol: str,
) -> bool:
    output_text = load_transpiled_frontend_source(
        transpiled_source_cache,
        repo_root=repo_root,
        file_path=file_path,
        source_path=source_path,
    )
    if output_text is None:
        return True
    return re.search(rf"\b{re.escape(symbol)}\b", output_text) is not None


def parse_frontend_diagnostics(
    repo_root: Path, frontend_typecheck: Path, buckets: dict[tuple[str, str], Finding]
) -> None:
    if not frontend_typecheck.is_file():
        return
    import_cache: dict[str, dict[str, dict[str, bool]]] = {}
    emitted_import_cache: dict[str, dict[str, dict[str, bool]] | None] = {}
    transpiled_source_cache: dict[str, str | None] = {}
    for raw_line in frontend_typecheck.read_text(
        encoding="utf-8", errors="replace"
    ).splitlines():
        match = FRONTEND_DIAGNOSTIC_RE.match(raw_line)
        if not match:
            continue
        rel_path, line_text, _, code, message = match.groups()
        file_path = f"frontend/{rel_path}"
        if (
            not is_production_path(file_path)
            or code not in RUNTIME_BREAK_TYPESCRIPT_CODES
        ):
            continue

        line = int(line_text)
        source_path = repo_root / file_path

        if code == "2304":
            symbol = missing_name_symbol(message)
            if symbol is None:
                continue
            if not missing_name_survives_js_emit(
                transpiled_source_cache,
                repo_root=repo_root,
                file_path=file_path,
                source_path=source_path,
                symbol=symbol,
            ):
                continue
            add_bucket(
                buckets,
                kind="missing-runtime-name",
                file_path=file_path,
                line=line,
                priority=100,
                title="Production code references an unbound runtime identifier",
                why="An unresolved identifier that still survives emitted JS will throw at render or module evaluation time on supported paths.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )
            continue

        if code == "2339" and "does not exist on type '{ readonly" in message:
            add_bucket(
                buckets,
                kind="missing-generated-member",
                file_path=file_path,
                line=line,
                priority=98,
                title="Production code expects runtime enum/object members that are missing",
                why="A readonly generated runtime object used by production code is missing members, which strongly suggests broken live dispatch or contract wiring.",
                evidence=f"{file_path}:{line} TS{code}: {message}",
            )
            continue

        missing_export = missing_export_details(message)
        if missing_export is None:
            continue

        module_path, symbol = missing_export
        if not is_frontend_local_module(module_path):
            continue

        imports = load_named_imports_for_source(
            import_cache,
            file_path=file_path,
            source_path=source_path,
        )
        if imports is None or not imports.get(module_path, {}).get(symbol, False):
            continue

        if not missing_export_survives_js_emit(
            emitted_import_cache,
            transpiled_source_cache,
            repo_root=repo_root,
            file_path=file_path,
            source_path=source_path,
            module_path=module_path,
            symbol=symbol,
        ):
            continue

        priority = 100 if module_path in {"utils/generatedTypes", "utils/constants"} else 99
        add_bucket(
            buckets,
            kind="missing-runtime-export",
            file_path=file_path,
            line=line,
            priority=priority,
            title="Production code imports value symbols that the source module does not export",
            why="A production-path value import points at a missing export, which breaks module evaluation and can crash app startup or any supported flow that loads the module.",
            evidence=f"{file_path}:{line} TS{code}: {message}",
        )


def scan_generated_type_contracts(
    repo_root: Path, buckets: dict[tuple[str, str], Finding]
) -> None:
    generated_types_path = repo_root / "frontend/src/utils/generatedTypes.ts"
    enum_members = parse_generated_types(generated_types_path)
    frontend_src = repo_root / "frontend/src"
    if not frontend_src.is_dir():
        return

    for path in frontend_src.rglob("*.[tj]s*"):
        if not path.is_file():
            continue
        relative_path = relative_repo_path(repo_root, path)
        if (
            not is_production_path(relative_path)
            or relative_path == "frontend/src/utils/generatedTypes.ts"
        ):
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        imports = parse_import_symbols(text).get("utils/generatedTypes", set())
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
                why="A generated enum member used in production code is absent from the exported enum object, which breaks live dispatch or other runtime wiring.",
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
        "This shortlist intentionally keeps only high-confidence runtime-bug signals inferred from typecheck and static contract scans.",
        "Type-only import/export churn, test-only noise, and helper/nullability cleanup are omitted on purpose.",
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
                "- No high-confidence runtime-bug findings matched the shortlist rules.",
                "- If the raw typecheck outputs still contain errors, treat that backlog as non-actionable until a concrete supported-flow runtime failure can be stated in the audit.",
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
    frontend_typecheck = (
        Path(args.frontend_typecheck).resolve() if args.frontend_typecheck else None
    )
    python_typecheck = (
        Path(args.python_typecheck).resolve() if args.python_typecheck else None
    )
    go_typecheck = Path(args.go_typecheck).resolve() if args.go_typecheck else None

    buckets: dict[tuple[str, str], Finding] = {}
    if frontend_typecheck is not None:
        parse_frontend_diagnostics(repo_root, frontend_typecheck, buckets)
    scan_generated_type_contracts(repo_root, buckets)

    findings = sorted(
        buckets.values(),
        key=lambda finding: (
            -finding.priority,
            finding.file_path,
            finding.line,
            finding.kind,
        ),
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
        description="Build a filtered runtime-bug shortlist from saved typecheck outputs."
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
