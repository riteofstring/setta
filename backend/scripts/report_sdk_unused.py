#!/usr/bin/env python3
"""Report backend/setta code that is unused by the Python SDK surface.

The analyzer is intentionally conservative:

- "Unreachable modules" and "unused top-level definitions" are reported with
  relatively high confidence, based on static imports rooted at the SDK entry
  modules.
- Class-member findings are reported separately as lower confidence because
  Python instance dispatch, Pydantic field access, and other dynamic patterns
  cannot be proven away with simple static analysis.

The default SDK roots are the user-facing Python SDK modules under
`backend/setta/api` plus the core chat-toolkit package under
`backend/setta/llm/chat_toolkit`.
"""

import argparse
import ast
import json
import os
import sys
from collections.abc import Callable, Iterable, Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TypeVar

TARGET_RELATIVE_PATH = Path("backend/setta")
DEFAULT_ROOT_PATHS = (
    Path("backend/setta/api"),
    Path("backend/setta/llm/chat_toolkit"),
)
EXCLUDED_RELATIVE_DIRS = (Path("backend/setta/types/generated"),)
SKIP_DIR_NAMES = {
    ".git",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
}


@dataclass(frozen=True)
class TopLevelDefinition:
    module: str
    name: str
    kind: str
    path: Path
    start_line: int
    end_line: int

    @property
    def key(self) -> tuple[str, str]:
        return (self.module, self.name)


@dataclass(frozen=True)
class ClassMemberDefinition:
    module: str
    class_name: str
    name: str
    kind: str
    path: Path
    start_line: int
    end_line: int

    @property
    def class_key(self) -> tuple[str, str]:
        return (self.module, self.class_name)

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.module, self.class_name, self.name)


@dataclass(frozen=True)
class ImportBinding:
    local_name: str
    target_module: str
    target_name: str | None
    kind: str


@dataclass
class ClassInfo:
    definition: TopLevelDefinition
    members: list[ClassMemberDefinition] = field(default_factory=list)
    member_dependencies: dict[str, set[str]] = field(default_factory=dict)

    @property
    def member_names(self) -> set[str]:
        return {member.name for member in self.members}


@dataclass
class ModuleInfo:
    module: str
    path: Path
    tree: ast.Module
    is_package: bool
    reportable: bool
    top_level_defs: dict[str, TopLevelDefinition]
    classes: dict[str, ClassInfo]
    imported_modules: set[str]
    import_bindings: list[ImportBinding]
    exported_names: set[str]

    @property
    def local_top_level_names(self) -> set[str]:
        return set(self.top_level_defs)


@dataclass
class AnalysisReport:
    reachable_modules: list[str]
    unreachable_modules: list[str]
    unused_top_level: list[TopLevelDefinition]
    potential_unused_members: list[ClassMemberDefinition]


DependencyKey = TypeVar("DependencyKey")


def is_type_checking_test(node: ast.expr) -> bool:
    if isinstance(node, ast.Name):
        return node.id == "TYPE_CHECKING"
    if isinstance(node, ast.Attribute):
        return (
            isinstance(node.value, ast.Name)
            and node.value.id == "typing"
            and node.attr == "TYPE_CHECKING"
        )
    return False


class TypeCheckingAwareNodeVisitor(ast.NodeVisitor):
    def visit_If(self, node: ast.If) -> None:
        if is_type_checking_test(node.test):
            for stmt in node.orelse:
                self.visit(stmt)
            return
        self.generic_visit(node)


def should_traverse_python_subdir(*, base_dir: Path, dirname: str) -> bool:
    if dirname in SKIP_DIR_NAMES:
        return False
    return not (base_dir / dirname / "pyvenv.cfg").is_file()


def iter_python_filenames(*, base_dir: Path, filenames: list[str]) -> Iterator[Path]:
    for filename in filenames:
        if filename.endswith(".py"):
            yield base_dir / filename


def iter_python_files(root: Path) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(root):
        base_dir = Path(dirpath)
        dirnames[:] = [
            dirname
            for dirname in dirnames
            if should_traverse_python_subdir(base_dir=base_dir, dirname=dirname)
        ]
        yield from iter_python_filenames(base_dir=base_dir, filenames=filenames)


def module_name_from_path(path: Path, repo_root: Path) -> str:
    relative = path.relative_to(repo_root).with_suffix("")
    parts = list(relative.parts)
    if parts and parts[0] == "backend":
        parts = parts[1:]
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    if not parts:
        raise ValueError(f"Could not compute module name for {path}")
    return ".".join(parts)


def resolve_from_import(
    *,
    current_module: str,
    current_is_package: bool,
    module: str | None,
    level: int,
) -> str:
    if level == 0:
        return module or ""
    current_parts = current_module.split(".")
    if current_is_package:
        base_parts = current_parts
    else:
        base_parts = current_parts[:-1]
    parent_parts = base_parts[: len(base_parts) - (level - 1)]
    if module:
        return ".".join([*parent_parts, *module.split(".")])
    return ".".join(parent_parts)


def assignment_target_names(stmt: ast.stmt) -> tuple[str, ...]:
    if isinstance(stmt, ast.Assign):
        return tuple(
            target.id for target in stmt.targets if isinstance(target, ast.Name)
        )
    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
        return (stmt.target.id,)
    return ()


def assignment_value_node(stmt: ast.stmt) -> ast.AST | None:
    if isinstance(stmt, ast.Assign):
        return stmt.value
    if isinstance(stmt, ast.AnnAssign):
        return stmt.value
    return None


def extract_exported_names(node: ast.AST) -> set[str]:
    if "__all__" not in assignment_target_names(node):
        return set()
    value = assignment_value_node(node)
    if not isinstance(value, (ast.List, ast.Tuple)):
        return set()
    return {
        element.value
        for element in value.elts
        if isinstance(element, ast.Constant) and isinstance(element.value, str)
    }


class ModuleImportCollector(TypeCheckingAwareNodeVisitor):
    def __init__(
        self,
        *,
        current_module: str,
        current_is_package: bool,
        known_modules: set[str],
    ) -> None:
        self._current_module = current_module
        self._current_is_package = current_is_package
        self._known_modules = known_modules
        self.imported_modules: set[str] = set()
        self.import_bindings: list[ImportBinding] = []

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name not in self._known_modules:
                continue
            self.imported_modules.add(alias.name)
            local_name = alias.asname or alias.name
            if "." in local_name and alias.asname is None:
                continue
            self.import_bindings.append(
                ImportBinding(
                    local_name=local_name,
                    target_module=alias.name,
                    target_name=None,
                    kind="module",
                )
            )

    def _record_star_import(self, *, base_module: str) -> None:
        if base_module in self._known_modules:
            self.imported_modules.add(base_module)

    def _record_submodule_import(
        self,
        *,
        base_module: str,
        alias: ast.alias,
    ) -> bool:
        maybe_submodule = f"{base_module}.{alias.name}"
        if maybe_submodule not in self._known_modules:
            return False
        self.imported_modules.add(maybe_submodule)
        self.import_bindings.append(
            ImportBinding(
                local_name=alias.asname or alias.name,
                target_module=maybe_submodule,
                target_name=None,
                kind="module",
            )
        )
        return True

    def _record_symbol_import(self, *, base_module: str, alias: ast.alias) -> None:
        if base_module not in self._known_modules:
            return
        self.imported_modules.add(base_module)
        self.import_bindings.append(
            ImportBinding(
                local_name=alias.asname or alias.name,
                target_module=base_module,
                target_name=alias.name,
                kind="symbol",
            )
        )

    def _record_from_import_alias(
        self,
        *,
        base_module: str,
        alias: ast.alias,
    ) -> None:
        if alias.name == "*":
            self._record_star_import(base_module=base_module)
            return
        if self._record_submodule_import(base_module=base_module, alias=alias):
            return
        self._record_symbol_import(base_module=base_module, alias=alias)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        base_module = resolve_from_import(
            current_module=self._current_module,
            current_is_package=self._current_is_package,
            module=node.module,
            level=node.level,
        )
        if not base_module:
            return
        for alias in node.names:
            self._record_from_import_alias(base_module=base_module, alias=alias)


def attribute_root_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    return None


class ClassMemberReferenceCollector(TypeCheckingAwareNodeVisitor):
    def __init__(self, *, class_name: str, member_names: set[str]) -> None:
        self._class_name = class_name
        self._member_names = member_names
        self.refs: set[str] = set()

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        if node.name == self._class_name:
            for stmt in node.body:
                self.visit(stmt)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load) and node.id in self._member_names:
            self.refs.add(node.id)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if (
            node.attr in self._member_names
            and isinstance(node.value, ast.Name)
            and node.value.id in {"self", "cls", self._class_name}
        ):
            self.refs.add(node.attr)
        self.generic_visit(node)


def collect_local_member_refs(
    *,
    class_name: str,
    member_names: set[str],
    node: ast.AST | None,
) -> set[str]:
    if node is None:
        return set()
    collector = ClassMemberReferenceCollector(
        class_name=class_name,
        member_names=member_names,
    )
    collector.visit(node)
    return collector.refs


class DefinitionUsageCollector(TypeCheckingAwareNodeVisitor):
    def __init__(
        self,
        *,
        module_info: ModuleInfo,
        module_infos: dict[str, ModuleInfo],
    ) -> None:
        self._module_info = module_info
        self._module_infos = module_infos
        self.used_top_level: set[tuple[str, str]] = set()
        self.used_members: set[tuple[str, str, str]] = set()
        self._imported_modules: dict[str, str] = {}
        self._imported_symbols: dict[str, tuple[str, str]] = {}
        self._attribute_member_targets: dict[str, tuple[tuple[str, str], ...]] = {
            class_name: ((module_info.module, class_name),)
            for class_name in module_info.classes
        }
        for binding in module_info.import_bindings:
            if binding.kind == "module":
                self._imported_modules[binding.local_name] = binding.target_module
            elif binding.target_name is not None:
                symbol_target = (
                    binding.target_module,
                    binding.target_name,
                )
                self._imported_symbols[binding.local_name] = symbol_target
                self._attribute_member_targets[binding.local_name] = (
                    *self._attribute_member_targets.get(binding.local_name, ()),
                    symbol_target,
                )

    def mark_root_reexports(self) -> None:
        for exported_name in self._module_info.exported_names:
            symbol_target = self._imported_symbols.get(exported_name)
            if symbol_target is not None:
                self._mark_top_level(*symbol_target)
                continue
            module_target = self._imported_modules.get(exported_name)
            if module_target is not None:
                self.used_top_level.add((module_target, "__module__"))

    def visit_Name(self, node: ast.Name) -> None:
        if not isinstance(node.ctx, ast.Load):
            self.generic_visit(node)
            return
        local_key = (self._module_info.module, node.id)
        if node.id in self._module_info.local_top_level_names:
            self.used_top_level.add(local_key)
        imported = self._imported_symbols.get(node.id)
        if imported is not None:
            self._mark_top_level(*imported)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        root_name = attribute_root_name(node.value)
        if root_name is not None:
            self._mark_attribute_targets(root_name=root_name, attr_name=node.attr)
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str):
            parts = node.value.split(".")
            if len(parts) >= 2:
                module_name = ".".join(parts[:-1])
                symbol_name = parts[-1]
                self._mark_top_level(module_name, symbol_name)
                if len(parts) >= 3:
                    class_module = ".".join(parts[:-2])
                    class_name = parts[-2]
                    self._mark_member(class_module, class_name, symbol_name)
        self.generic_visit(node)

    def _mark_top_level(self, module_name: str, name: str) -> None:
        module_info = self._module_infos.get(module_name)
        if module_info is None:
            return
        if name in module_info.top_level_defs:
            self.used_top_level.add((module_name, name))

    def _mark_member(
        self,
        module_name: str,
        class_name: str,
        member_name: str,
    ) -> None:
        module_info = self._module_infos.get(module_name)
        if module_info is None:
            return
        class_info = module_info.classes.get(class_name)
        if class_info is None:
            return
        if member_name in class_info.member_names:
            self.used_members.add((module_name, class_name, member_name))

    def _mark_attribute_targets(self, *, root_name: str, attr_name: str) -> None:
        imported_module = self._imported_modules.get(root_name)
        if imported_module is not None:
            self._mark_top_level(imported_module, attr_name)
        for module_name, class_name in self._attribute_member_targets.get(
            root_name, ()
        ):
            self._mark_member(module_name, class_name, attr_name)


def build_method_member_definition(
    *,
    module_name: str,
    class_name: str,
    path: Path,
    stmt: ast.FunctionDef | ast.AsyncFunctionDef,
) -> ClassMemberDefinition:
    return ClassMemberDefinition(
        module=module_name,
        class_name=class_name,
        name=stmt.name,
        kind="method",
        path=path,
        start_line=stmt.lineno,
        end_line=stmt.end_lineno or stmt.lineno,
    )


def build_class_attribute_definition(
    *,
    module_name: str,
    class_name: str,
    path: Path,
    stmt: ast.stmt,
    name: str,
) -> ClassMemberDefinition:
    return ClassMemberDefinition(
        module=module_name,
        class_name=class_name,
        name=name,
        kind="class_attribute",
        path=path,
        start_line=stmt.lineno,
        end_line=stmt.end_lineno or stmt.lineno,
    )


def build_member_definitions_from_stmt(
    *,
    module_name: str,
    class_name: str,
    path: Path,
    stmt: ast.stmt,
) -> list[ClassMemberDefinition]:
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
        return [
            build_method_member_definition(
                module_name=module_name,
                class_name=class_name,
                path=path,
                stmt=stmt,
            )
        ]
    return [
        build_class_attribute_definition(
            module_name=module_name,
            class_name=class_name,
            path=path,
            stmt=stmt,
            name=name,
        )
        for name in assignment_target_names(stmt)
    ]


def collect_class_member_definitions(
    *,
    module_name: str,
    class_name: str,
    path: Path,
    body: list[ast.stmt],
) -> list[ClassMemberDefinition]:
    members: list[ClassMemberDefinition] = []
    for stmt in body:
        members.extend(
            build_member_definitions_from_stmt(
                module_name=module_name,
                class_name=class_name,
                path=path,
                stmt=stmt,
            )
        )
    return members


def collect_class_member_dependency_entries(
    *,
    class_name: str,
    member_names: set[str],
    stmt: ast.stmt,
) -> list[tuple[str, set[str]]]:
    if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
        refs = collect_local_member_refs(
            class_name=class_name,
            member_names=member_names,
            node=stmt,
        )
        return [(stmt.name, refs - {stmt.name})]
    target_names = assignment_target_names(stmt)
    value = assignment_value_node(stmt)
    if not target_names or value is None:
        return []
    refs = collect_local_member_refs(
        class_name=class_name,
        member_names=member_names,
        node=value,
    )
    return [(name, refs - {name}) for name in target_names]


def collect_class_member_dependencies(
    *,
    class_name: str,
    member_names: set[str],
    body: list[ast.stmt],
) -> dict[str, set[str]]:
    dependencies: dict[str, set[str]] = {}
    for stmt in body:
        for name, refs in collect_class_member_dependency_entries(
            class_name=class_name,
            member_names=member_names,
            stmt=stmt,
        ):
            dependencies[name] = refs
    return dependencies


def build_class_info(
    *,
    module_name: str,
    path: Path,
    node: ast.ClassDef,
) -> ClassInfo:
    class_def = TopLevelDefinition(
        module=module_name,
        name=node.name,
        kind="class",
        path=path,
        start_line=node.lineno,
        end_line=node.end_lineno or node.lineno,
    )
    members = collect_class_member_definitions(
        module_name=module_name,
        class_name=node.name,
        path=path,
        body=node.body,
    )
    member_names = {member.name for member in members}
    return ClassInfo(
        definition=class_def,
        members=members,
        member_dependencies=collect_class_member_dependencies(
            class_name=node.name,
            member_names=member_names,
            body=node.body,
        ),
    )


def parse_module_info(
    *,
    path: Path,
    repo_root: Path,
    known_modules: set[str],
    reportable: bool,
) -> ModuleInfo:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    module_name = module_name_from_path(path, repo_root)
    is_package = path.name == "__init__.py"
    top_level_defs: dict[str, TopLevelDefinition] = {}
    classes: dict[str, ClassInfo] = {}
    exported_names: set[str] = set()
    for node in tree.body:
        exported_names.update(extract_exported_names(node))
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            top_level_defs[node.name] = TopLevelDefinition(
                module=module_name,
                name=node.name,
                kind="function",
                path=path,
                start_line=node.lineno,
                end_line=node.end_lineno or node.lineno,
            )
            continue
        if isinstance(node, ast.ClassDef):
            class_info = build_class_info(
                module_name=module_name,
                path=path,
                node=node,
            )
            classes[node.name] = class_info
            top_level_defs[node.name] = class_info.definition
    import_collector = ModuleImportCollector(
        current_module=module_name,
        current_is_package=is_package,
        known_modules=known_modules,
    )
    import_collector.visit(tree)
    return ModuleInfo(
        module=module_name,
        path=path,
        tree=tree,
        is_package=is_package,
        reportable=reportable,
        top_level_defs=top_level_defs,
        classes=classes,
        imported_modules=import_collector.imported_modules,
        import_bindings=import_collector.import_bindings,
        exported_names=exported_names,
    )


def should_exclude_path(*, path: Path, excluded_dirs: tuple[Path, ...]) -> bool:
    normalized = path.resolve()
    return any(excluded_dir in normalized.parents for excluded_dir in excluded_dirs)


def collect_module_infos(
    *,
    repo_root: Path,
    target_dir: Path,
    excluded_dirs: tuple[Path, ...],
) -> dict[str, ModuleInfo]:
    paths = list(iter_python_files(target_dir))
    known_modules = {module_name_from_path(path, repo_root) for path in paths}
    return {
        module_name_from_path(path, repo_root): parse_module_info(
            path=path,
            repo_root=repo_root,
            known_modules=known_modules,
            reportable=not should_exclude_path(path=path, excluded_dirs=excluded_dirs),
        )
        for path in paths
    }


def resolve_root_modules(
    *,
    module_infos: dict[str, ModuleInfo],
    root_paths: tuple[Path, ...],
) -> set[str]:
    root_modules: set[str] = set()
    resolved_roots = tuple(path.resolve() for path in root_paths)
    for module_name, module_info in module_infos.items():
        resolved_path = module_info.path.resolve()
        for root_path in resolved_roots:
            if resolved_path == root_path or root_path in resolved_path.parents:
                root_modules.add(module_name)
                break
    return root_modules


def expand_dependency_closure(
    *,
    seed_keys: set[DependencyKey],
    next_keys: Callable[[DependencyKey], Iterable[DependencyKey]],
) -> set[DependencyKey]:
    expanded = set(seed_keys)
    queue = list(seed_keys)
    while queue:
        for dependency_key in next_keys(queue.pop()):
            if dependency_key in expanded:
                continue
            expanded.add(dependency_key)
            queue.append(dependency_key)
    return expanded


def iter_known_imported_modules(
    *,
    module_infos: dict[str, ModuleInfo],
    module_name: str,
) -> Iterator[str]:
    module_info = module_infos.get(module_name)
    if module_info is None:
        return
    yield from (
        imported_module
        for imported_module in module_info.imported_modules
        if imported_module in module_infos
    )


def collect_reachable_modules(
    *,
    module_infos: dict[str, ModuleInfo],
    root_modules: set[str],
) -> set[str]:
    return expand_dependency_closure(
        seed_keys=root_modules,
        next_keys=lambda module_name: iter_known_imported_modules(
            module_infos=module_infos,
            module_name=module_name,
        ),
    )


def exported_top_level_names(module_info: ModuleInfo) -> set[str]:
    if module_info.exported_names:
        return {
            name
            for name in module_info.exported_names
            if name in module_info.top_level_defs
        }
    return {name for name in module_info.top_level_defs if not name.startswith("_")}


def exported_member_names(class_info: ClassInfo) -> set[str]:
    return {
        member.name
        for member in class_info.members
        if member.kind == "method"
        and (
            member.name == "__init__"
            or (member.name.startswith("__") and member.name.endswith("__"))
            or not member.name.startswith("_")
        )
    }


def iter_member_dependency_keys(
    *,
    module_infos: dict[str, ModuleInfo],
    member_key: tuple[str, str, str],
) -> Iterator[tuple[str, str, str]]:
    module_name, class_name, member_name = member_key
    module_info = module_infos.get(module_name)
    if module_info is None:
        return
    class_info = module_info.classes.get(class_name)
    if class_info is None:
        return
    yield from (
        (module_name, class_name, dependency_name)
        for dependency_name in class_info.member_dependencies.get(member_name, set())
    )


def propagate_member_dependencies(
    *,
    module_infos: dict[str, ModuleInfo],
    used_members: set[tuple[str, str, str]],
) -> set[tuple[str, str, str]]:
    return expand_dependency_closure(
        seed_keys=used_members,
        next_keys=lambda member_key: iter_member_dependency_keys(
            module_infos=module_infos,
            member_key=member_key,
        ),
    )


def collect_root_usage(
    *,
    module_infos: dict[str, ModuleInfo],
    root_modules: set[str],
) -> tuple[set[tuple[str, str]], set[tuple[str, str, str]], set[tuple[str, str]]]:
    used_top_level: set[tuple[str, str]] = set()
    used_members: set[tuple[str, str, str]] = set()
    root_exported_classes: set[tuple[str, str]] = set()

    for root_module in sorted(root_modules):
        module_info = module_infos[root_module]
        exported_names = exported_top_level_names(module_info)
        used_top_level.update((root_module, name) for name in exported_names)
        root_exported_classes.update(
            (root_module, name)
            for name in exported_names
            if name in module_info.classes
        )
        collector = DefinitionUsageCollector(
            module_info=module_info,
            module_infos=module_infos,
        )
        collector.mark_root_reexports()
        used_top_level.update(
            key for key in collector.used_top_level if key[1] != "__module__"
        )
        used_members.update(collector.used_members)
        for module_name, name in collector.used_top_level:
            if name == "__module__":
                continue
            module_data = module_infos[module_name]
            if name in module_data.classes and (module_name, name) in used_top_level:
                root_exported_classes.add((module_name, name))

    return used_top_level, used_members, root_exported_classes


def collect_reachable_usage(
    *,
    module_infos: dict[str, ModuleInfo],
    reachable_modules: set[str],
) -> tuple[set[tuple[str, str]], set[tuple[str, str, str]]]:
    used_top_level: set[tuple[str, str]] = set()
    used_members: set[tuple[str, str, str]] = set()

    for module_name in sorted(reachable_modules):
        module_info = module_infos[module_name]
        usage_collector = DefinitionUsageCollector(
            module_info=module_info,
            module_infos=module_infos,
        )
        usage_collector.visit(module_info.tree)
        used_top_level.update(usage_collector.used_top_level)
        used_members.update(usage_collector.used_members)

    return used_top_level, used_members


def collect_report_findings(
    *,
    module_infos: dict[str, ModuleInfo],
    reachable_modules: set[str],
    used_top_level: set[tuple[str, str]],
    used_members: set[tuple[str, str, str]],
) -> tuple[list[str], list[TopLevelDefinition], list[ClassMemberDefinition]]:
    unreachable_modules = sorted(
        module_name
        for module_name, module_info in module_infos.items()
        if module_info.reportable and module_name not in reachable_modules
    )
    unused_top_level: list[TopLevelDefinition] = []
    potential_unused_members: list[ClassMemberDefinition] = []

    for module_name in sorted(reachable_modules):
        module_info = module_infos[module_name]
        if not module_info.reportable:
            continue
        unused_top_level.extend(
            definition
            for definition in module_info.top_level_defs.values()
            if definition.key not in used_top_level
        )
        potential_unused_members.extend(
            member
            for class_name, class_info in module_info.classes.items()
            if (module_name, class_name) in used_top_level
            for member in class_info.members
            if member.key not in used_members
        )

    unused_top_level.sort(
        key=lambda definition: (definition.module, definition.start_line)
    )
    potential_unused_members.sort(
        key=lambda member: (member.module, member.class_name, member.start_line)
    )
    return unreachable_modules, unused_top_level, potential_unused_members


def analyze_repo(
    *,
    repo_root: Path,
    target_dir: Path,
    root_paths: tuple[Path, ...],
    excluded_dirs: tuple[Path, ...],
) -> AnalysisReport:
    module_infos = collect_module_infos(
        repo_root=repo_root,
        target_dir=target_dir,
        excluded_dirs=excluded_dirs,
    )
    root_modules = resolve_root_modules(
        module_infos=module_infos, root_paths=root_paths
    )
    if not root_modules:
        raise RuntimeError("No root SDK modules were found.")
    reachable_modules = collect_reachable_modules(
        module_infos=module_infos,
        root_modules=root_modules,
    )
    used_top_level, used_members, root_exported_classes = collect_root_usage(
        module_infos=module_infos,
        root_modules=root_modules,
    )
    reachable_used_top_level, reachable_used_members = collect_reachable_usage(
        module_infos=module_infos,
        reachable_modules=reachable_modules,
    )
    used_top_level.update(reachable_used_top_level)
    used_members.update(reachable_used_members)

    for module_name, class_name in root_exported_classes:
        class_info = module_infos[module_name].classes[class_name]
        for member_name in exported_member_names(class_info):
            used_members.add((module_name, class_name, member_name))

    used_members = propagate_member_dependencies(
        module_infos=module_infos,
        used_members=used_members,
    )
    unreachable_modules, unused_top_level, potential_unused_members = (
        collect_report_findings(
            module_infos=module_infos,
            reachable_modules=reachable_modules,
            used_top_level=used_top_level,
            used_members=used_members,
        )
    )

    return AnalysisReport(
        reachable_modules=sorted(reachable_modules),
        unreachable_modules=unreachable_modules,
        unused_top_level=unused_top_level,
        potential_unused_members=potential_unused_members,
    )


def render_report_section(
    *,
    title: str,
    items: list[object],
    formatter,
) -> list[str]:
    lines = ["", title]
    if not items:
        lines.append("  (none)")
        return lines
    lines.extend(f"  - {formatter(item)}" for item in items)
    return lines


def format_top_level_definition(definition: TopLevelDefinition) -> str:
    return (
        f"{definition.module}.{definition.name} "
        f"[{definition.kind}] "
        f"({definition.path}:{definition.start_line})"
    )


def format_class_member(member: ClassMemberDefinition) -> str:
    return (
        f"{member.module}.{member.class_name}.{member.name} "
        f"[{member.kind}] "
        f"({member.path}:{member.start_line})"
    )


def render_text_report(report: AnalysisReport) -> str:
    lines = [
        "SDK unused-code report",
        "",
        f"Reachable modules: {len(report.reachable_modules)}",
        f"Unreachable modules: {len(report.unreachable_modules)}",
        f"Unused top-level definitions: {len(report.unused_top_level)}",
        f"Potentially unused class members: {len(report.potential_unused_members)}",
    ]
    lines.extend(
        render_report_section(
            title="High confidence: unreachable modules",
            items=report.unreachable_modules,
            formatter=str,
        )
    )
    lines.extend(
        render_report_section(
            title="High confidence: unused top-level definitions",
            items=report.unused_top_level,
            formatter=format_top_level_definition,
        )
    )
    lines.extend(
        render_report_section(
            title="Lower confidence: potentially unused class members",
            items=report.potential_unused_members,
            formatter=format_class_member,
        )
    )
    return "\n".join(lines) + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report code under backend/setta that is unused by the Python SDK surface."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Override repository root (defaults to the checkout root).",
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=TARGET_RELATIVE_PATH,
        help="Relative path to analyze.",
    )
    parser.add_argument(
        "--root-path",
        action="append",
        type=Path,
        default=None,
        help="Relative root path that counts as SDK entry surface. Repeatable.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of text.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    repo_root = (
        args.repo_root.resolve()
        if args.repo_root is not None
        else Path(__file__).resolve().parents[2]
    )
    target_dir = (repo_root / args.target_dir).resolve()
    root_paths = tuple(
        (repo_root / relative_path).resolve()
        for relative_path in (args.root_path or list(DEFAULT_ROOT_PATHS))
    )
    excluded_dirs = tuple(
        (repo_root / path).resolve() for path in EXCLUDED_RELATIVE_DIRS
    )
    report = analyze_repo(
        repo_root=repo_root,
        target_dir=target_dir,
        root_paths=root_paths,
        excluded_dirs=excluded_dirs,
    )
    if args.json:
        payload = {
            "reachable_modules": report.reachable_modules,
            "unreachable_modules": report.unreachable_modules,
            "unused_top_level": [
                {
                    **asdict(definition),
                    "path": str(definition.path),
                }
                for definition in report.unused_top_level
            ],
            "potential_unused_members": [
                {
                    **asdict(member),
                    "path": str(member.path),
                }
                for member in report.potential_unused_members
            ],
        }
        print(json.dumps(payload, indent=2))
        return 0
    print(render_text_report(report), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
