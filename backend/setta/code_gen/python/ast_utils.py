import ast
import builtins

from setta.code_gen.python.position_line_col import line_col_to_position_batch


class UndefinedSpecialVarVisitor(ast.NodeVisitor):
    def __init__(self, special_var, keep_attr_only):
        self.expressions: dict[str, tuple[int, int]] = {}
        self.defined_vars = set(dir(builtins))  # Start with builtins
        self.special_var = special_var
        self.keep_attr_only = keep_attr_only

    def visit_Attribute(self, node):
        # Check for s.* expression (only 1-level deep)
        if isinstance(node.value, ast.Name) and node.value.id == self.special_var:
            if self.special_var not in self.defined_vars:
                # Capture attribute expression
                if self.keep_attr_only:
                    expr = node.attr
                else:
                    expr = f"{self.special_var}.{node.attr}"

                # Store expression with its line,col position
                # Note: Need to adjust from 1-indexed to 0-indexed line numbers
                # Adjust column to take into account special var and dot.
                self.expressions[expr] = (
                    node.lineno - 1,
                    node.col_offset + len(self.special_var) + 1,
                )
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

    def visit_DictComp(self, node):
        # Create a copy of defined vars for the comprehension scope
        old_defined = self.defined_vars.copy()

        # Visit the generators first
        for gen in node.generators:
            self.visit(gen.iter)

            # Add target variables to defined variables
            if isinstance(gen.target, ast.Name):
                self.defined_vars.add(gen.target.id)
            elif isinstance(gen.target, (ast.Tuple, ast.List)):
                for (
                    elt
                ) in gen.target.elts:  # Fixed: using gen.target instead of node.target
                    if isinstance(elt, ast.Name):
                        self.defined_vars.add(elt.id)

            # Visit ifs
            for if_clause in gen.ifs:
                self.visit(if_clause)

        # Visit key and value expressions
        self.visit(node.key)
        self.visit(node.value)

        # Restore original defined vars
        self.defined_vars = old_defined

    def visit_SetComp(self, node):
        # Create a copy of defined vars for the comprehension scope
        old_defined = self.defined_vars.copy()

        # Visit the generators first
        for gen in node.generators:
            self.visit(gen.iter)

            # Add target variables to defined variables
            if isinstance(gen.target, ast.Name):
                self.defined_vars.add(gen.target.id)
            elif isinstance(gen.target, (ast.Tuple, ast.List)):
                for (
                    elt
                ) in gen.target.elts:  # Fixed: using gen.target instead of node.target
                    if isinstance(elt, ast.Name):
                        self.defined_vars.add(elt.id)

            # Visit ifs
            for if_clause in gen.ifs:
                self.visit(if_clause)

        # Visit element expression
        self.visit(node.elt)

        # Restore original defined vars
        self.defined_vars = old_defined


def find_undefined_special_var_expressions(
    code_string, special_var, keep_attr_only
) -> dict[str, int]:
    if not code_string.strip():
        return {}

    try:
        tree = ast.parse(code_string)
    except SyntaxError:
        return {}

    visitor = UndefinedSpecialVarVisitor(special_var, keep_attr_only)
    visitor.visit(tree)

    # Convert line,col positions to absolute positions
    if visitor.expressions:
        # Get all line,col pairs
        positions = line_col_to_position_batch(
            code_string, visitor.expressions.values()
        )
        idx = 0
        for k in visitor.expressions.keys():
            visitor.expressions[k] = positions[idx]  # type: ignore
            idx += 1
        return visitor.expressions  # type: ignore

    return {}
