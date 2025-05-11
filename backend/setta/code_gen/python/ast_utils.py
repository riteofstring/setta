import ast
import builtins


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


class UndefinedSpecialVarVisitor(ast.NodeVisitor):
    def __init__(self, special_var):
        self.expressions = set()
        self.defined_vars = set(dir(builtins))  # Start with builtins
        self.special_var = special_var

    def visit_Attribute(self, node):
        # Check for s.* expression (only 1-level deep)
        if isinstance(node.value, ast.Name) and node.value.id == self.special_var:
            if self.special_var not in self.defined_vars:
                # Capture attribute expression
                attr_name = f"{self.special_var}.{node.attr}"
                self.expressions.add(attr_name)
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store):
            self.defined_vars.add(node.id)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        # Add function name to defined variables
        self.defined_vars.add(node.name)

        # Create a copy of defined vars for the function scope
        old_defined = self.defined_vars.copy()

        # Add arguments to defined variables
        for arg in node.args.args:
            self.defined_vars.add(arg.arg)

        # Visit function body
        for stmt in node.body:
            self.visit(stmt)

        # Restore original defined vars
        self.defined_vars = old_defined

    def visit_For(self, node):
        # Visit the iterator
        self.visit(node.iter)

        # Add target to defined variables
        if isinstance(node.target, ast.Name):
            self.defined_vars.add(node.target.id)
        elif isinstance(node.target, (ast.Tuple, ast.List)):
            for elt in node.target.elts:
                if isinstance(elt, ast.Name):
                    self.defined_vars.add(elt.id)
        else:
            self.visit(node.target)

        # Visit body and else clause
        for stmt in node.body:
            self.visit(stmt)
        for stmt in node.orelse:
            self.visit(stmt)

    def visit_ListComp(self, node):
        # Create a copy of defined vars for the comprehension scope
        old_defined = self.defined_vars.copy()

        # Visit the generators first
        for gen in node.generators:
            self.visit(gen.iter)

            # Add target variables to defined variables
            if isinstance(gen.target, ast.Name):
                self.defined_vars.add(gen.target.id)

            # Visit ifs
            for if_clause in gen.ifs:
                self.visit(if_clause)

        # Visit element expression
        self.visit(node.elt)

        # Restore original defined vars
        self.defined_vars = old_defined


def find_undefined_special_var_expressions(code_string, special_var):
    if not code_string.strip():
        return set()

    try:
        tree = ast.parse(code_string)
    except SyntaxError:
        return set()

    visitor = UndefinedSpecialVarVisitor(special_var)
    visitor.visit(tree)

    return visitor.expressions
