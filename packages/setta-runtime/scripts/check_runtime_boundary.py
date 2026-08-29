#!/usr/bin/env python3


from __future__ import annotations

import argparse
import ast
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

MAX_PRODUCTION_COMPLEXITY = 12
_MODULE_ROOT = Path(__file__).resolve().parents[1] / "src"


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    rule: str
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: {self.rule}: {self.message}"


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        choices=("all", "imports", "complexity"),
        default="all",
        help="boundary family to validate (default: all)",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=_MODULE_ROOT,
        help="directory containing the production setta package",
    )
    parser.add_argument(
        "--complexity-limit",
        type=int,
        default=MAX_PRODUCTION_COMPLEXITY,
        help=f"maximum per-function cyclomatic complexity (default: {MAX_PRODUCTION_COMPLEXITY})",
    )
    namespace = parser.parse_args(arguments)
    if namespace.complexity_limit < 1:
        parser.error("--complexity-limit must be at least one")
    source_root = namespace.source_root.resolve()
    findings: list[Finding] = []
    if namespace.check in {"all", "imports"}:
        findings.extend(check_import_boundaries(source_root))
    if namespace.check in {"all", "complexity"}:
        findings.extend(check_complexity(source_root, namespace.complexity_limit))
    if findings:
        for finding in sorted(
            findings, key=lambda item: (str(item.path), item.line, item.rule)
        ):
            print(finding.render())
        return 1
    print("setta runtime boundary checks passed")
    return 0


def check_import_boundaries(source_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path, module, tree in _production_modules(source_root):
        for imported, line in _internal_imports(tree, module, path):
            message = _import_violation(module, imported)
            if message is not None:
                findings.append(Finding(path, line, "architecture", message))
    return findings


def check_complexity(
    source_root: Path, limit: int = MAX_PRODUCTION_COMPLEXITY
) -> list[Finding]:
    findings: list[Finding] = []
    for path, _module, tree in _production_modules(source_root):
        for function in _functions(tree):
            complexity = cyclomatic_complexity(function)
            if complexity > limit:
                findings.append(
                    Finding(
                        path,
                        function.lineno,
                        "complexity",
                        f"{function.name} has cyclomatic complexity {complexity}; limit is {limit}",
                    )
                )
    return findings


def cyclomatic_complexity(function: ast.FunctionDef | ast.AsyncFunctionDef) -> int:
    counter = _ComplexityCounter()
    for statement in function.body:
        counter.visit(statement)
    return 1 + counter.decisions


def _production_modules(source_root: Path) -> Iterator[tuple[Path, str, ast.Module]]:
    package_root = source_root / "setta"
    if not package_root.is_dir():
        raise ValueError(f"production package directory is missing: {package_root}")
    for path in sorted(package_root.rglob("*.py")):
        relative = path.relative_to(source_root).with_suffix("")
        parts = list(relative.parts)
        if parts[-1] == "__init__":
            parts.pop()
        module = ".".join(parts)
        try:
            source = path.read_text(encoding="utf-8")
            yield path, module, ast.parse(source, filename=str(path))
        except (OSError, UnicodeDecodeError, SyntaxError) as error:
            line = getattr(error, "lineno", 1) or 1
            raise ValueError(
                f"cannot parse production module {path}:{line}: {error}"
            ) from error


def _internal_imports(
    tree: ast.Module, importer: str, path: Path
) -> Iterator[tuple[str, int]]:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "setta" or alias.name.startswith("setta."):
                    yield alias.name, node.lineno
        elif isinstance(node, ast.ImportFrom):
            imported = _resolve_import_from(importer, path, node)
            if imported == "setta" or imported.startswith("setta."):
                yield imported, node.lineno


def _resolve_import_from(importer: str, path: Path, node: ast.ImportFrom) -> str:
    if node.level == 0:
        return node.module or ""
    parts = importer.split(".")
    package = parts if path.name == "__init__.py" else parts[:-1]
    parent_count = node.level - 1
    if parent_count > len(package):
        return ""
    base = package[: len(package) - parent_count]
    if node.module:
        base.extend(node.module.split("."))
    return ".".join(base)


def _import_violation(importer: str, imported: str) -> str | None:
    is_app = importer == "setta.apps" or importer.startswith("setta.apps.")
    is_app_import = imported == "setta.apps" or imported.startswith("setta.apps.")
    if importer == "setta.cli":
        if imported.startswith("setta.apps."):
            return "the root dispatcher must register apps through the setta.apps facade, not an app implementation"
        return None
    if not is_app and is_app_import:
        return "platform core modules must not depend on app adapters"
    if not is_app:
        return None
    if imported == "setta.cli" or imported.startswith("setta.cli."):
        return "app adapters must not import the root dispatcher"
    if imported.startswith("setta.apps."):
        if importer == "setta.apps":
            return None
        if imported != importer:
            return "app adapters must not depend on another app implementation"
    return None


def _functions(tree: ast.Module) -> Iterable[ast.FunctionDef | ast.AsyncFunctionDef]:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


class _ComplexityCounter(ast.NodeVisitor):
    def __init__(self) -> None:
        self.decisions = 0

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        del node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        del node

    def visit_If(self, node: ast.If) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_For(self, node: ast.For) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_While(self, node: ast.While) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_IfExp(self, node: ast.IfExp) -> None:
        self.decisions += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        self.decisions += max(len(node.values) - 1, 0)
        self.generic_visit(node)

    def visit_Match(self, node: ast.Match) -> None:
        self.decisions += max(len(node.cases) - 1, 0)
        self.generic_visit(node)

    def visit_comprehension(self, node: ast.comprehension) -> None:
        self.decisions += len(node.ifs)
        self.generic_visit(node)


if __name__ == "__main__":
    raise SystemExit(main())
