# from anthropic import Anthropic

# client = Anthropic()
# with client.messages.with_streaming_response.create(
#     max_tokens=1024,
#     messages=[
#         {
#             "role": "user",
#             "content": "Hello, Claude",
#         }
#     ],
#     model="claude-3-5-sonnet-latest",
#     stream=True
# ) as response:
#     print(response.headers)
#     for event in response.parse():
#         print(event)


# from anthropic import AsyncAnthropic
# import asyncio

# async def main():
#     client = AsyncAnthropic()
#     ctx = client.messages.with_streaming_response.create(
#         max_tokens=1024,
#         messages=[
#             {
#                 "role": "user",
#                 "content": "Hello, Claude",
#             }
#         ],
#         model="claude-3-5-sonnet-latest",
#         stream=True
#     )
#     async with ctx as response:
#         print(response.headers)
#         stream = await response.parse()
#         async for event in stream:
#             print(event)


# asyncio.run(main())


# import asyncio

# from anthropic import AsyncAnthropic


# async def main():
#     client = AsyncAnthropic()
#     response = await client.messages.with_raw_response.create(
#         max_tokens=1024,
#         messages=[
#             {
#                 "role": "user",
#                 "content": "Hello, Claude",
#             }
#         ],
#         model="claude-3-5-sonnet-latest",
#         stream=True,
#     )
#     print(response.headers.keys())
#     async for event in response.parse():
#         print(event)


# asyncio.run(main())


# import ast


# def find_section_dependencies(code, section_names):
#     """Find dependencies between sections by analyzing 'self.X' references in expressions."""
#     dependencies = set()

#     class DependencyVisitor(ast.NodeVisitor):
#         def visit_Attribute(self, node):
#             # Check for self.X attributes
#             if isinstance(node.value, ast.Name) and node.value.id == "self":
#                 if node.attr in section_names:
#                     dependencies.add(node.attr)

#             # Continue visiting other nodes
#             self.generic_visit(node)

#     # Try parsing the code
#     try:
#         # For expressions, wrap as needed
#         try:
#             tree = ast.parse(code, mode="eval")  # Try as expression first
#         except SyntaxError:
#             # If that fails, try as a statement/module
#             tree = ast.parse(code)

#         DependencyVisitor().visit(tree)
#     except SyntaxError:
#         # Handle unparseable code gracefully
#         pass

#     return dependencies


# def test_dependency_visitor():
#     """Test the dependency visitor with expression code examples."""
#     # Define section names
#     section_names = [
#         "model",
#         "optimizer",
#         "loss_fn",
#         "dataset",
#         "learning_rate",
#         "bias",
#     ]

#     # Test cases with expected dependencies
#     test_cases = [
#         # Basic reference
#         {"code": "self.model", "expected": {"model"}},
#         # Method call
#         {"code": "self.model.parameters()", "expected": {"model"}},
#         # Multiple references in function call
#         {
#             "code": "torch.optim.Adam(params=self.model.parameters(), lr=self.learning_rate)",
#             "expected": {"model", "learning_rate"},
#         },
#         # Right side of assignment only
#         {
#             "code": "torch.optim.Adam(params=self.model.parameters())",
#             "expected": {"model"},
#         },
#         # Complex nested case
#         {
#             "code": "self.loss_fn(self.model(self.dataset[0]))",
#             "expected": {"loss_fn", "model", "dataset"},
#         },
#         # No dependencies
#         {"code": "torch.randn(10, 10)", "expected": set()},
#         # Complex expression
#         {"code": "self.model(x) + self.bias", "expected": {"model", "bias"}},
#         # Invalid code (should handle gracefully)
#         {"code": "self.model.parameters(", "expected": set()},
#     ]

#     # Run tests
#     results = []
#     for i, test in enumerate(test_cases):
#         deps = find_section_dependencies(test["code"], section_names)
#         success = deps == test["expected"]
#         results.append(
#             {
#                 "test": i + 1,
#                 "code": test["code"],
#                 "expected": test["expected"],
#                 "actual": deps,
#                 "success": success,
#             }
#         )

#     # Print results
#     print("Test Results:")
#     all_passed = True
#     for result in results:
#         status = "✅ PASS" if result["success"] else "❌ FAIL"
#         print(f"Test {result['test']}: {status}")
#         print(f"  Code: {result['code']}")
#         print(f"  Expected: {result['expected']}")
#         print(f"  Actual: {result['actual']}")
#         print()
#         if not result["success"]:
#             all_passed = False

#     print(f"Overall: {'✅ All tests passed' if all_passed else '❌ Some tests failed'}")

#     return all_passed


# # Run the test
# if __name__ == "__main__":
#     test_dependency_visitor()


# import math


# class S:
#     def __init__(s):
#         s.args = SettaArgs()
#         s.args.the_result[0].x = 5
#         the_result__i0 = math.sqrt(s.args.the_result[0].x)
#         s.args.the_result[1].x = 10
#         the_result__i1 = math.sqrt(s.args.the_result[1].x)
#         s.the_result = [the_result__i0, the_result__i1]


# s = S()
# print(s.the_result)
# print(s.args)


import asyncio
import json
from pprint import pprint

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.generate_code import PythonCodeGenerator
from setta.utils.constants import USER_SETTINGS


async def main():
    with open("test_project_state.json", "r") as f:
        project_state = json.load(f)
    print("exporting...")

    USER_SETTINGS["languageServer"] = {}

    dep_graph = DependencyGraph(project_state)
    pprint(dep_graph.graph)
    code_generator = PythonCodeGenerator(dep_graph)
    code, _ = code_generator.generate_code()

    print(code)


if __name__ == "__main__":
    asyncio.run(main())
