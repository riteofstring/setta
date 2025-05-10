import ast


def find_top_level_symbols(source: str) -> set[str]:
    """Find all top-level symbol names that could cause naming conflicts."""
    root = ast.parse(source)
    symbols = set()

    # Helper function to extract names from complex assignment targets
    def extract_names_from_target(target):
        if isinstance(target, ast.Name):
            symbols.add(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for elt in target.elts:
                extract_names_from_target(elt)
        elif isinstance(target, ast.Starred):
            # Handle starred expressions like *rest
            if isinstance(target.value, ast.Name):
                symbols.add(target.value.id)

    # Only look at top-level nodes
    for node in root.body:
        # Get top-level assignments
        if isinstance(node, ast.Assign):
            for target in node.targets:
                extract_names_from_target(target)
        # Get annotated assignments
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name):
                symbols.add(node.target.id)
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
        # Get global declarations
        elif isinstance(node, ast.Global):
            for name in node.names:
                symbols.add(name)
    return symbols
