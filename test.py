# Example usage
from setta.code_gen.python.make_parseable import make_parseable, is_parseable, maybe_add_newline


test_cases = [
    ("x=math.sqrt(\n", "x"),
    ("y=(1,\n2,\n3)\n", "y"),
    ("z='hello\n", "z"),
    ("w=1+\n", "w"),
    ("a=[1,2,\n", "a"),
    ("b={1:2,\n", "b"),
]

for code, var in test_cases:
    result = maybe_add_newline(make_parseable(code, var))
    print(f"Original: {code!r}")
    print(f"Fixed: {result!r}")
    print(f"Parseable: {is_parseable(result)}\n")