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


# class SettaArgs:
#     def __init__(self):
#         # Internal dictionary to store attributes
#         self._attributes = {}

#     def __getattr__(self, name):
#         # When accessing a non-existent attribute, create a new container
#         if name not in self._attributes:
#             self._attributes[name] = SettaArgs()
#         return self._attributes[name]

#     def __setattr__(self, name, value):
#         # Handle the special case of our internal _attributes dictionary
#         if name == "_attributes":
#             super().__setattr__(name, value)
#         else:
#             # Store all other attributes in our _attributes dictionary
#             self._attributes[name] = value

#     def __getitem__(self, key):
#         # Handle access with square brackets (both numeric indices and string keys)
#         if key not in self._attributes:
#             self._attributes[key] = SettaArgs()
#         return self._attributes[key]

#     def __setitem__(self, key, value):
#         # Handle assignment with square brackets
#         self._attributes[key] = value

#     def __str__(self):
#         # For a readable string representation
#         return str(self._attributes)

#     def __repr__(self):
#         # For representation in interactive sessions
#         return self.__str__()


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


from setta.code_gen.export_selected import export_selected
from setta.code_gen.python.generate_code import generate_code


def get_project_state():
    return {
        "projectConfig": {
            "id": "28c8b0b6-3638-42a3-b2e5-83500547e3f4",
            "name": "drawing_wandering",
            "previewImgColor": "bg-green-500/60 dark:bg-green-600/30",
            "viewingEditingMode": "DEV",
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "children": {
                "0e473819-7bb5-44ee-8601-e76cb9ab6a84": {
                    "x": 510,
                    "y": 75,
                    "zIndex": 0,
                    "w": 202,
                    "h": 106,
                }
            },
        },
        "sectionVariants": {
            "50b84cb5-defe-4e79-aba6-5b3439b22fb7": {
                "name": "bored_aquamarine",
                "values": {},
                "children": [],
                "selectedItem": None,
                "code": "",
                "codeInfoColId": None,
                "description": "",
                "evRefs": [],
                "templateVars": [],
                "isFrozen": False,
                "sweep": [],
                "runGroup": {},
                "configLanguage": "python",
                "isJsonSource": False,
                "jsonSourceKeys": [],
                "jsonSourceMissing": False,
            }
        },
        "artifacts": {},
        "artifactGroups": {},
        "uiTypes": {},
        "uiTypeCols": {},
        "sections": {
            "0e473819-7bb5-44ee-8601-e76cb9ab6a84": {
                "id": "0e473819-7bb5-44ee-8601-e76cb9ab6a84",
                "name": "xeric_salmon",
                "size": {"width": "auto", "height": "auto"},
                "parentId": None,
                "variantId": "50b84cb5-defe-4e79-aba6-5b3439b22fb7",
                "uiTypeId": "0191cde4-3d98-4ba0-972a-fead19b8ac73",
                "uiTypeColId": None,
                "social": "",
                "artifactGroupIds": [],
                "defaultVariantId": "50b84cb5-defe-4e79-aba6-5b3439b22fb7",
                "variantIds": ["50b84cb5-defe-4e79-aba6-5b3439b22fb7"],
                "paramSweepSectionId": None,
                "nonPresetUITypeIds": [],
                "codeLanguage": "python",
                "isEntryCodeBlock": False,
                "isFrozen": False,
                "isHorizontalOrientation": False,
                "hideParams": False,
                "hideSearch": False,
                "hideUnpinnedParams": False,
                "hideColumn": False,
                "displayMode": "GUI",
                "visibility": {"DEV": True, "USER": True},
                "pinnedAreaHeight": "auto",
                "isMinimized": False,
                "canvasSettings": {
                    "activeLayerId": None,
                    "color": "#ff0000",
                    "brushSize": 16,
                    "brushShape": "butt",
                    "eraserBrushSize": 16,
                    "drawThrottleDelay": 0,
                    "canvasTransferQueueLength": 50,
                    "mode": "draw",
                },
                "chartSettings": {
                    "type": "line",
                    "xAxisColumn": "",
                    "secondYAxisColumns": [],
                    "xAxisLog": False,
                    "y1AxisLog": False,
                    "y2AxisLog": False,
                },
                "isTemporary": False,
                "renderMarkdown": False,
                "positionAndSizeLocked": False,
                "selectedVariantIds": {},
                "paramFilter": "",
                "isInOtherProjectConfigs": False,
                "aspectRatio": False,
                "aspectRatioExtraHeight": 0,
                "aspectRatioExtraWidth": 0,
                "columnWidth": 82,
                "renderedValue": None,
                "headingAsSectionName": False,
            }
        },
        "codeInfo": {},
        "codeInfoCols": {},
    }


import asyncio
import json


async def main():
    project_state = get_project_state()
    exporter_obj = export_selected(project_state)
    print(json.dumps(exporter_obj.output, indent=2), flush=True)

    code = generate_code(exporter_obj.output)
    print(code, flush=True)


if __name__ == "__main__":
    asyncio.run(main())
