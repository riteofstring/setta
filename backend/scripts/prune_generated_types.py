#!/usr/bin/env python3
"""Remove unused names from backend/setta/types/generated.

The script scans every Python file in the repository, finds which names from
the Go-generated Python shared types are referenced, and deletes the unused
ones. Run it after generation has refreshed the full generated surface.
"""

import argparse
import ast
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Iterator

TARGET_RELATIVE_PATH = Path("backend/setta/types/generated")
MODULE_PREFIX = "setta.types.generated"
SKIP_DIR_NAMES = {
    ".git",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
}


@dataclass(frozen=True)
class Definition:
    module: str
    name: str
    path: Path
    start_line: int
    end_line: int
    node_type: str

    @property
    def key(self) -> tuple[str, str]:
        return (self.module, self.name)


class _LocalReferenceCollector(ast.NodeVisitor):
    """Records names that are referenced within a module."""

    def __init__(self) -> None:
        self.names: set[str] = set()

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            self.names.add(node.id)
        self.generic_visit(node)


def module_name_from_path(path: Path, repo_root: Path) -> str:
    """Convert a generated file path into its module name."""
    relative = path.relative_to(repo_root).with_suffix("")
    parts = list(relative.parts)
    if parts and parts[0] == "backend":
        parts = parts[1:]

    if parts and parts[-1] == "__init__":
        parts = parts[:-1]

    if not parts:
        raise ValueError(f"Could not compute module name for {path}")

    return ".".join(parts)


def extract_names_from_assign_target(target: ast.expr) -> list[str]:
    result: list[str] = []
    if isinstance(target, ast.Name):
        result.append(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for elt in target.elts:
            result.extend(extract_names_from_assign_target(elt))
    return result


def definition_names_from_node(node: ast.stmt) -> tuple[str, ...]:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return (node.name,)
    if isinstance(node, ast.Assign):
        return tuple(
            name
            for target in node.targets
            for name in extract_names_from_assign_target(target)
        )
    if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
        return (node.target.id,)
    return ()


def build_definition(
    *,
    module_name: str,
    path: Path,
    node: ast.stmt,
    name: str,
) -> Definition:
    return Definition(
        module=module_name,
        name=name,
        path=path,
        start_line=node.lineno,
        end_line=node.end_lineno or node.lineno,
        node_type=type(node).__name__,
    )


def collect_definitions(
    target_dir: Path, repo_root: Path
) -> tuple[list[Definition], dict[str, set[str]]]:
    definitions: list[Definition] = []
    module_local_refs: dict[str, set[str]] = {}
    for path in sorted(target_dir.glob("*.py")):
        module_name = module_name_from_path(path, repo_root)
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            raise RuntimeError(f"Failed to parse {path}: {exc}") from exc

        for node in tree.body:
            definitions.extend(
                build_definition(
                    module_name=module_name,
                    path=path,
                    node=node,
                    name=name,
                )
                for name in definition_names_from_node(node)
            )
        ref_collector = _LocalReferenceCollector()
        ref_collector.visit(tree)
        module_local_refs[module_name] = ref_collector.names
    return definitions, module_local_refs


def iter_python_files(root: Path) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        base_dir = Path(dirpath)
        filtered_dirnames: list[str] = []
        for dirname in dirnames:
            if dirname in SKIP_DIR_NAMES:
                continue
            # Built/install helpers can create additional venvs with custom names
            # (for example .venv_for_built_setta). Avoid scanning any virtualenv.
            if (base_dir / dirname / "pyvenv.cfg").is_file():
                continue
            filtered_dirnames.append(dirname)
        dirnames[:] = filtered_dirnames
        for filename in filenames:
            if filename.endswith(".py"):
                yield Path(dirpath, filename)


class UsageCollector(ast.NodeVisitor):
    def __init__(
        self,
        mark_used: Callable[[str, str], None],
        module_to_names: dict[str, set[str]],
    ) -> None:
        super().__init__()
        self._mark_used = mark_used
        self._module_to_names = module_to_names
        self._imported_names: dict[str, tuple[str, str]] = {}
        self._imported_modules: dict[str, str] = {}

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.level:
            return
        module_name = node.module or ""
        if not module_name.startswith(MODULE_PREFIX):
            return

        if not node.names:
            return

        for alias in node.names:
            if alias.name == "*":
                for name in self._module_to_names.get(module_name, set()):
                    self._mark_used(module_name, name)
                continue

            local_name = alias.asname or alias.name
            full_module = f"{module_name}.{alias.name}"
            if full_module in self._module_to_names:
                self._imported_modules[local_name] = full_module
                continue

            # Treat direct imports as usage even when the current module only
            # re-exports the imported symbol via __all__.
            self._mark_used(module_name, alias.name)
            self._imported_names[local_name] = (module_name, alias.name)

    def visit_Name(self, node: ast.Name) -> None:
        data = self._imported_names.get(node.id)
        if data:
            self._mark_used(*data)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if isinstance(node.value, ast.Name):
            module_name = self._imported_modules.get(node.value.id)
            if module_name:
                self._mark_used(module_name, node.attr)
        self.generic_visit(node)


def collect_used_keys(
    repo_root: Path,
    module_to_names: dict[str, set[str]],
    *,
    initial_used_keys: Iterable[tuple[str, str]] | None = None,
) -> set[tuple[str, str]]:
    used_keys: set[tuple[str, str]] = set(initial_used_keys or [])

    def mark_used(module: str, name: str) -> None:
        if name in module_to_names.get(module, set()):
            used_keys.add((module, name))

    for path in iter_python_files(repo_root):
        try:
            source = path.read_text(encoding="utf-8")
        except OSError:
            continue

        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError:
            continue

        collector = UsageCollector(mark_used, module_to_names)
        collector.visit(tree)

    return used_keys


def apply_removals(removals: dict[Path, list[Definition]], *, dry_run: bool) -> None:
    if dry_run:
        for path, defs in sorted(removals.items()):
            print(f"[dry-run] {path}: would remove {len(defs)} definitions")
            for definition in sorted(defs, key=lambda d: d.start_line):
                print(
                    f"    - {definition.name} "
                    f"(lines {definition.start_line}-{definition.end_line})"
                )
        return

    for path, defs in sorted(removals.items()):
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        for definition in sorted(defs, key=lambda d: d.start_line, reverse=True):
            start_idx = max(definition.start_line - 1, 0)
            end_idx = min(definition.end_line, len(lines))

            # Remove trailing blank lines that immediately follow the block.
            temp_idx = end_idx
            while temp_idx < len(lines) and not lines[temp_idx].strip():
                temp_idx += 1
            end_idx = temp_idx

            del lines[start_idx:end_idx]

        new_content = "".join(lines).rstrip() + "\n"
        path.write_text(new_content, encoding="utf-8")
        print(f"[prune-generated] Updated {path} ({len(defs)} definitions removed)")


def cleanup_unused_imports(paths: Iterable[Path], *, dry_run: bool) -> int:
    updated_files = 0
    for path in sorted(set(paths)):
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            raise RuntimeError(f"Failed to parse {path}: {exc}") from exc

        ref_collector = _LocalReferenceCollector()
        ref_collector.visit(tree)
        used_names = ref_collector.names
        lines = source.splitlines(keepends=True)
        replacements: list[tuple[int, int, str]] = []

        for node in tree.body:
            replacement = render_cleaned_import(node, used_names)
            if replacement is None:
                continue
            replacements.append(
                (
                    max(node.lineno - 1, 0),
                    min(node.end_lineno or node.lineno, len(lines)),
                    replacement,
                )
            )

        if not replacements:
            continue

        updated_files += 1
        if dry_run:
            print(f"[dry-run] {path}: would clean unused imports")
            continue

        for start_idx, end_idx, replacement in reversed(replacements):
            replacement_lines = [] if replacement == "" else [replacement]
            lines[start_idx:end_idx] = replacement_lines

        new_content = "".join(lines).rstrip() + "\n"
        path.write_text(new_content, encoding="utf-8")
        print(f"[prune-generated] Cleaned unused imports in {path}")

    return updated_files


def render_cleaned_import(node: ast.stmt, used_names: set[str]) -> str | None:  # noqa: C901
    if isinstance(node, ast.Import):
        kept_names = []
        for alias in node.names:
            local_name = alias.asname or alias.name
            if local_name in used_names:
                kept_names.append(alias)
        if len(kept_names) == len(node.names):
            return None
        if not kept_names:
            return ""
        parts = []
        for alias in kept_names:
            if alias.asname:
                parts.append(f"{alias.name} as {alias.asname}")
            else:
                parts.append(alias.name)
        return f"import {', '.join(parts)}\n"

    if isinstance(node, ast.ImportFrom):
        if node.level:
            return None
        if node.module == "__future__":
            return None
        kept_names = []
        for alias in node.names:
            if alias.name == "*":
                kept_names.append(alias)
                continue
            local_name = alias.asname or alias.name
            if local_name in used_names:
                kept_names.append(alias)
        if len(kept_names) == len(node.names):
            return None
        if not kept_names:
            return ""
        rendered_names = []
        for alias in kept_names:
            if alias.asname:
                rendered_names.append(f"{alias.name} as {alias.asname}")
            else:
                rendered_names.append(alias.name)
        module = node.module or ""
        return f"from {module} import {', '.join(rendered_names)}\n"

    return None


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prune unused names from backend/setta/types/generated."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Override repository root (defaults to the git checkout root).",
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=TARGET_RELATIVE_PATH,
        help="Relative path to the generated backend types directory.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report unused names without modifying files.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:  # noqa: C901
    args = parse_args(argv)
    repo_root = (
        args.repo_root.resolve()
        if args.repo_root
        else Path(__file__).resolve().parents[2]
    )
    target_dir = (repo_root / args.target_dir).resolve()
    if not target_dir.exists():
        raise SystemExit(f"Target directory {target_dir} does not exist.")

    iteration = 0
    total_removed = 0
    files_touched: set[Path] = set()

    while True:
        iteration += 1
        definitions, module_local_refs = collect_definitions(target_dir, repo_root)
        if not definitions:
            print("No definitions found in the generated directory.")
            return 0

        module_to_names: dict[str, set[str]] = {}
        for definition in definitions:
            module_to_names.setdefault(definition.module, set()).add(definition.name)

        initial_used_keys = {
            definition.key
            for definition in definitions
            if definition.name in module_local_refs.get(definition.module, set())
        }

        used_keys = collect_used_keys(
            repo_root,
            module_to_names,
            initial_used_keys=initial_used_keys,
        )
        unused_definitions = [
            definition for definition in definitions if definition.key not in used_keys
        ]

        if not unused_definitions:
            cleaned_import_files = cleanup_unused_imports(
                files_touched if total_removed > 0 else target_dir.glob("*.py"),
                dry_run=args.dry_run,
            )
            if total_removed == 0:
                if cleaned_import_files > 0:
                    print(
                        f"[prune-generated] Cleaned unused imports in "
                        f"{cleaned_import_files} file"
                        f"{'' if cleaned_import_files == 1 else 's'}."
                    )
                if cleaned_import_files == 0:
                    print("No unused generated names were found.")
                return 0
            else:
                if cleaned_import_files > 0:
                    print(
                        f"[prune-generated] Also cleaned unused imports in "
                        f"{cleaned_import_files} file"
                        f"{'' if cleaned_import_files == 1 else 's'}."
                    )
                print(
                    f"[prune-generated] Success after {iteration - 1} iteration"
                    f"{'' if iteration == 2 else 's'}."
                )
                print(
                    f"[prune-generated] Removed {total_removed} definition"
                    f"{'' if total_removed == 1 else 's'} "
                    f"across {len(files_touched)} file"
                    f"{'' if len(files_touched) == 1 else 's'}."
                )
            return 0

        removals: dict[Path, list[Definition]] = {}
        for definition in unused_definitions:
            removals.setdefault(definition.path, []).append(definition)

        files_touched.update(removals.keys())
        total_removed += len(unused_definitions)

        print(
            f"[prune-generated] Iteration {iteration}: "
            f"found {len(unused_definitions)} unused definition"
            f"{'' if len(unused_definitions) == 1 else 's'} "
            f"in {len(removals)} file{'s' if len(removals) != 1 else ''}."
        )

        apply_removals(removals, dry_run=args.dry_run)

        if args.dry_run:
            print(
                "[prune-generated] Dry run stops after the first iteration; "
                "re-run without --dry-run to prune and trigger additional passes."
            )
            print(
                f"[dry-run] Identified {total_removed} unused definition"
                f"{'' if total_removed == 1 else 's'} "
                f"across {len(files_touched)} file"
                f"{'' if len(files_touched) == 1 else 's'}."
            )
            return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
