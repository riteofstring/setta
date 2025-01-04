import ast
from dataclasses import dataclass
from typing import List, Set

@dataclass
class ScopeRange:
    start_line: int
    start_col: int
    end_line: int
    end_col: int
    variable_names: Set[str]

class ScopeVisitor(ast.NodeVisitor):
    def __init__(self):
        self.scopes: List[ScopeRange] = []
        self._current_scope_vars: Set[str] = set()
        
    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, ast.Store):
            self._current_scope_vars.add(node.id)
        self.generic_visit(node)
        
    def _visit_scope_node(self, node: ast.AST):
        # Save previous scope variables
        prev_vars = self._current_scope_vars.copy()
        self._current_scope_vars = set()
        
        # Visit the node's children
        self.generic_visit(node)
        
        # Create scope range
        scope = ScopeRange(
            start_line=node.lineno,
            start_col=node.col_offset,
            end_line=node.end_lineno,
            end_col=node.end_col_offset,
            variable_names=self._current_scope_vars
        )
        self.scopes.append(scope)
        
        # Restore previous scope variables
        self._current_scope_vars = prev_vars
        
    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._visit_scope_node(node)
        
    def visit_ClassDef(self, node: ast.ClassDef):
        # Save previous scope variables
        prev_vars = self._current_scope_vars.copy()
        self._current_scope_vars = set()
        
        # Visit the node's children
        self.generic_visit(node)
        
        # Class variables are accessible in methods, so we need to add them to method scopes
        class_vars = self._current_scope_vars.copy()
        for child in node.body:
            if isinstance(child, ast.FunctionDef):
                scope = next((s for s in self.scopes if s.start_line == child.lineno), None)
                if scope:
                    scope.variable_names.update(class_vars)
        
        # Create scope range for the class itself
        scope = ScopeRange(
            start_line=node.lineno,
            start_col=node.col_offset,
            end_line=node.end_lineno,
            end_col=node.end_col_offset,
            variable_names=self._current_scope_vars
        )
        self.scopes.append(scope)
        
        # Restore previous scope variables
        self._current_scope_vars = prev_vars
        
    def visit_Module(self, node: ast.Module):
        # Module node is special - it represents the entire file
        self._current_scope_vars = set()
        
        # Visit all children
        self.generic_visit(node)
        
        # For Module, use first/last line of content
        first_line = float('inf')
        last_line = 0
        first_col = float('inf')
        last_col = 0
        
        for child in ast.walk(node):
            if hasattr(child, 'lineno'):
                first_line = min(first_line, child.lineno)
                first_col = min(first_col, child.col_offset)
            if hasattr(child, 'end_lineno'):
                last_line = max(last_line, child.end_lineno)
                last_col = max(last_col, child.end_col_offset)
        
        # Handle empty files
        if first_line == float('inf'):
            first_line = 1
            first_col = 0
            last_line = 1
            last_col = 0
            
        scope = ScopeRange(
            start_line=first_line,
            start_col=first_col,
            end_line=last_line,
            end_col=last_col,
            variable_names=self._current_scope_vars
        )
        self.scopes.append(scope)

def is_position_in_scope_with_variable(
    code: str,
    position: tuple[int, int],
    variable_name: str
) -> bool:
    """
    Check if a position in the code is in the same scope as a specific variable.
    
    Args:
        code: The Python code as a string
        position: Tuple of (line, column) for the position to check
        variable_name: Name of the variable to check for
        
    Returns:
        bool: True if the position is in the same scope as the variable
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False
        
    visitor = ScopeVisitor()
    visitor.visit(tree)
    
    line, col = position
    
    # Check each scope
    for scope in visitor.scopes:
        # Check if position is within this scope
        if not (
            scope.start_line <= line <= scope.end_line and
            (scope.start_line != line or scope.start_col <= col) and
            (scope.end_line != line or col <= scope.end_col)
        ):
            continue
            
        # Check if variable is defined in this scope
        if variable_name in scope.variable_names:
            return True
            
    return False

# Tests
def test_scope_checker():
    # Test 1: Simple global scope
    code1 = """
unique_var_name = 42
x = 10
"""
    assert is_position_in_scope_with_variable(code1, (2, 0), "unique_var_name")
    assert is_position_in_scope_with_variable(code1, (3, 0), "unique_var_name")
    
    # Test 2: Function scope
    code2 = """
def my_function():
    unique_var_name = 42
    x = 10

y = 20
"""
    assert not is_position_in_scope_with_variable(code2, (6, 0), "unique_var_name")
    assert is_position_in_scope_with_variable(code2, (4, 4), "unique_var_name")
    
    # Test 3: Nested function scope
    code3 = """
def outer():
    x = 1
    def inner():
        unique_var_name = 42
        y = 2
    z = 3
"""
    assert not is_position_in_scope_with_variable(code3, (7, 4), "unique_var_name")
    assert is_position_in_scope_with_variable(code3, (6, 8), "unique_var_name")
    
    # Test 4: Class scope
    code4 = """
class MyClass:
    unique_var_name = 42
    
    def method(self):
        x = 10
        print(unique_var_name)  # Class variables are accessible in methods
        
def outside_func():
    y = 20
"""
    # Variable is accessible within class definition
    assert is_position_in_scope_with_variable(code4, (3, 4), "unique_var_name")
    # Variable is accessible within method
    assert is_position_in_scope_with_variable(code4, (6, 8), "unique_var_name")
    # Variable is not accessible outside class
    assert not is_position_in_scope_with_variable(code4, (10, 4), "unique_var_name")
    
    # Test 4b: Nested class scope
    code4b = """
class Outer:
    outer_var = 1
    
    class Inner:
        unique_var_name = 42
        
        def inner_method(self):
            x = 10
            
    def outer_method(self):
        y = 20
"""
    # Variable is accessible within inner class
    assert is_position_in_scope_with_variable(code4b, (9, 12), "unique_var_name")
    # Variable is not accessible in outer class method
    assert not is_position_in_scope_with_variable(code4b, (12, 8), "unique_var_name")
    
    # Test 5: Invalid code
    code5 = "this is not valid python code"
    assert not is_position_in_scope_with_variable(code5, (1, 0), "unique_var_name")

    # Test 2: Function scope
    code6 = """
def my_function():
    unique_var_name = 42
    x = 10
    _

y = 20
"""
    assert is_position_in_scope_with_variable(code6, (5, 4), "unique_var_name")
    
    print("All tests passed!")

if __name__ == "__main__":
    test_scope_checker()