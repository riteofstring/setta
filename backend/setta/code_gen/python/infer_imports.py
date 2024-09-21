import ast

from ...utils.constants import BUILT_INS


class ImportInferrer(ast.NodeVisitor):
    def __init__(self):
        self.modules = set()
        self.current_scope = set()
        self.global_scope = set()  # New set to track global identifiers

    def visit_Module(self, node):
        # Collect names of all functions and classes defined at the module level
        for stmt in node.body:
            if isinstance(stmt, ast.FunctionDef) or isinstance(stmt, ast.ClassDef):
                self.global_scope.add(stmt.name)
            elif isinstance(stmt, ast.Assign):
                for target in stmt.targets:
                    if isinstance(target, ast.Name):
                        self.global_scope.add(target.id)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        self.enter_scope(node.args.args)
        self.generic_visit(node)
        self.exit_scope(node.args.args)

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_For(self, node):
        self.enter_scope([node.target])
        self.generic_visit(node)
        self.exit_scope([node.target])

    def visit_comprehension(self, node):
        self.enter_scope([node.target])
        self.generic_visit(node)
        self.exit_scope([node.target])

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.current_scope.add(target.id)
            elif isinstance(target, ast.Tuple) or isinstance(target, ast.List):
                for elem in target.elts:
                    if isinstance(elem, ast.Name):
                        self.current_scope.add(elem.id)
        self.generic_visit(node)

    def visit_Call(self, node):
        self.check_and_add_module(node.func)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        self.check_and_add_module(node)
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            self.global_scope.add(name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            self.global_scope.add(name)
        self.generic_visit(node)

    def check_and_add_module(self, node):
        module = self.resolve_module(node)
        if module:
            self.modules.add(module)

    def resolve_module(self, node):
        if isinstance(node, ast.Name):
            if (
                node.id not in self.current_scope
                and node.id not in self.global_scope
                and node.id not in BUILT_INS
            ):
                return node.id
        elif isinstance(node, ast.Attribute):
            base = self.resolve_module(node.value)
            if base and "." not in base:
                return base
        return None

    def enter_scope(self, nodes):
        for node in nodes:
            if isinstance(node, ast.arg):
                self.current_scope.add(node.arg)
            elif isinstance(node, ast.Name):
                self.current_scope.add(node.id)

    def exit_scope(self, nodes):
        for node in nodes:
            if isinstance(node, ast.arg):
                self.current_scope.remove(node.arg)
            elif isinstance(node, ast.Name):
                self.current_scope.remove(node.id)


def infer_imports(code):
    tree = ast.parse(code)
    inferrer = ImportInferrer()
    inferrer.visit(tree)
    return set(list(inferrer.modules))
