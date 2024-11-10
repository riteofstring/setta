import ast

def find_missing_imports(code):
    tree = ast.parse(code)
    used_names = set()
    defined_names = set()

    def get_attribute_names(node):
        names = []
        while isinstance(node, ast.Attribute):
            names.append(node.attr)
            node = node.value
        if isinstance(node, ast.Name):
            names.append(node.id)
        return list(reversed(names))

    class CodeVisitor(ast.NodeVisitor):
        def visit_Name(self, node):
            used_names.add(node.id)
            self.generic_visit(node)
        def visit_Attribute(self, node):
            names = get_attribute_names(node)
            if names:
                used_names.add(names[0])  # Collect the base name
            self.generic_visit(node)
        def visit_FunctionDef(self, node):
            defined_names.add(node.name)
            for arg in node.args.args:
                defined_names.add(arg.arg)
            self.generic_visit(node)
        def visit_ClassDef(self, node):
            defined_names.add(node.name)
            self.generic_visit(node)
        def visit_Assign(self, node):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    defined_names.add(target.id)
                elif isinstance(target, ast.Tuple):
                    for elt in target.elts:
                        if isinstance(elt, ast.Name):
                            defined_names.add(elt.id)
                elif isinstance(target, ast.Attribute):
                    pass  # Ignore attributes (e.g., self.x)
            self.generic_visit(node)
        def visit_Import(self, node):
            for alias in node.names:
                defined_names.add(alias.asname or alias.name.split('.')[0])
        def visit_ImportFrom(self, node):
            for alias in node.names:
                defined_names.add(alias.asname or alias.name)
            defined_names.add(node.module.split('.')[0] if node.module else '')

    CodeVisitor().visit(tree)

    undefined_names = used_names - defined_names - set(dir(__builtins__))

    # Predefined mapping of names to modules
    name_to_module = {}

    missing_imports = set()
    for name in undefined_names:
            missing_imports.add(f"import {name}")

    return '\n'.join(sorted(missing_imports))


code = """
def compute_angle(x):
    return math.sin(x) + numpy.cos(x) + math.sqrt(x)

data = pandas.DataFrame({'a': [1, 2, 3]})
"""

imports = find_missing_imports(code)
print(imports)
