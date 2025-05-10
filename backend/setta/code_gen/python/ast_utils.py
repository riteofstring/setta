import ast
from typing import Set


def find_top_level_symbols(source: str) -> Set[str]:
    """Find all top-level symbol names that could cause naming conflicts."""
    root = ast.parse(source)
    symbols = set()

    # Only look at top-level nodes
    for node in root.body:
        # Get top-level assignments
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    symbols.add(target.id)

        # Get function and class names
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            symbols.add(node.name)

        # Get import aliases and imported names
        elif isinstance(node, ast.Import):
            for alias in node.names:
                symbols.add(alias.asname if alias.asname else alias.name.split(".")[0])

        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                symbols.add(alias.asname if alias.asname else alias.name)

    return symbols