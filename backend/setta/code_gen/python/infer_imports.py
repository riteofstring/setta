import ast
import builtins
from typing import Set


def find_missing_imports(code: str) -> Set[str]:
    """
    Analyzes Python code and returns a set of missing imports.

    Args:
        code (str): String containing Python code to analyze

    Returns:
        Set[str]: Set of import statements that are missing

    Example:
        >>> code = "x = torch.nn.CrossEntropyLoss()"
        >>> find_missing_imports(code)
        {'torch', 'torch.nn'}
    """
    # Get set of built-in names
    builtin_names = set(dir(builtins))

    # Track existing imports, defined names, and missing imports
    existing_imports = set()
    defined_names = set()
    missing_imports = set()

    # Parse the code into an AST
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Invalid Python code: {str(e)}")

    # First pass: collect existing imports and defined names
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                existing_imports.add(name.name)  # Original name
                if name.asname:  # Alias
                    existing_imports.add(name.asname)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                existing_imports.add(node.module)
                for name in node.names:
                    # Add both the fully qualified name and the direct import name
                    existing_imports.add(f"{node.module}.{name.name}")
                    if name.asname:  # Alias
                        existing_imports.add(name.asname)
                    else:
                        existing_imports.add(name.name)
        elif isinstance(node, ast.FunctionDef):
            defined_names.add(node.name)
        elif isinstance(node, ast.ClassDef):
            defined_names.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            defined_names.add(node.id)
        elif isinstance(node, ast.arg):
            defined_names.add(node.arg)

    # Second pass: find potential missing imports
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            # Skip if it's a built-in, already imported, or locally defined
            if (
                node.id not in builtin_names
                and node.id not in existing_imports
                and node.id not in defined_names
                and isinstance(node.ctx, ast.Load)
            ):
                missing_imports.add(node.id)
        elif isinstance(node, ast.Attribute):
            # Build the full attribute chain
            attr_chain = []
            current = node
            while isinstance(current, ast.Attribute):
                attr_chain.append(current.attr)
                current = current.value
            if isinstance(current, ast.Name):
                attr_chain.append(current.id)

                # Skip if the root is a local name
                if attr_chain[0] in defined_names:
                    continue

            # Reverse to get correct order (e.g., ['torch', 'nn', 'CrossEntropyLoss'])
            attr_chain.reverse()

            # Generate all possible import paths
            for i in range(1, len(attr_chain)):
                import_path = ".".join(attr_chain[:i])
                if (
                    import_path not in existing_imports
                    and import_path not in builtin_names
                    and import_path not in defined_names
                ):
                    missing_imports.add(import_path)

    return missing_imports
