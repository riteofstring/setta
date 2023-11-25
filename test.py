# # import re

# # def clean_line(line):
# #     # Remove trailing operators
# #     while line and line[-1] in {'.', ',', '+', '-', '*', '/', '%', '<', '>', '&', '|', '^', '~', ':', ';'}:
# #         line = line[:-1]

# #     # Balance parentheses and brackets
# #     stack = []
# #     for char in line:
# #         if char in '([{':
# #             stack.append(char)
# #         elif char in ')]}':
# #             if stack:
# #                 last_open = stack[-1]
# #                 if (char == ')' and last_open == '(') or \
# #                    (char == ']' and last_open == '[') or \
# #                    (char == '}' and last_open == '{'):
# #                     stack.pop()
# #                 else:
# #                     line = line.replace(char, '', 1)
# #             else:
# #                 line = line.replace(char, '', 1)

# #     # Add closing brackets for unmatched opening brackets
# #     closing_brackets = {'(': ')', '[': ']', '{': '}'}
# #     for open_bracket in reversed(stack):
# #         line += closing_brackets[open_bracket]

# #     # Use regex to find and complete incomplete assignments
# #     incomplete_assignment_regex = r'(\=\s*($|\,|\)|\]|\}|\;))'
# #     line = re.sub(incomplete_assignment_regex, '=None\\2', line)

# #     return line


# # # Test the function
# # result = clean_line("x=torch==")
# # print(result)

# # import ast
# # ast.parse(result)


# def balance_brackets_quotes(s):
#     stack = []
#     balanced_string = ''

#     # Maps of opening and closing brackets
#     opening_brackets = {'(': ')', '{': '}', '[': ']'}
#     closing_brackets = {')': '(', '}': '{', ']': '['}

#     for char in s:
#         if char in opening_brackets or char in ['"', "'"]:
#             # Push opening brackets and quotes onto the stack
#             stack.append(char)
#         elif char in closing_brackets:
#             if stack and stack[-1] == closing_brackets[char]:
#                 # Properly closed bracket
#                 stack.pop()
#             else:
#                 # Unbalanced closing bracket, insert corresponding opening bracket
#                 balanced_string += closing_brackets[char]
#         balanced_string += char

#     # Add any unmatched opening brackets or quotes at the end
#     while stack:
#         opening = stack.pop()
#         if opening in opening_brackets:
#             balanced_string += opening_brackets[opening]
#         else:
#             balanced_string += opening  # For quotes, just repeat the same character

#     return balanced_string

# # Example usage
# input_string = 'x=torch(y="'
# balanced_string = balance_brackets_quotes(input_string)
# print(balanced_string)

# import ast
# ast.parse(balanced_string)


import jedi
from pprint import pprint
from runcoder.code.utils import get_var_name
import string
import copy


def append_will_change_var_name(char_to_append):
    # Check if the original string is a valid identifier
    # if not var_name.isidentifier():
    #     raise ValueError("The provided string is not a valid Python identifier")
    # Check if the character to append is a letter, digit, or underscore
    if char_to_append in string.ascii_letters + string.digits + "_":
        return True  # Appending will result in a new variable name
    else:
        return False  # Appending will not create a valid variable name, possibly an operator


def get_str_from_value(value, codeJson):
    output = []
    for v in value:
        if v["type"] == "raw":
            output.append(v["value"])
        else:
            output.append(get_var_name(codeJson, v["value"]))
    return "".join(output)


from_frontend = [
    {"type": "ref", "value": "e580c968-b48e-47d9-ab85-b55b951a9444"},
    {"type": "raw", "value": "+s"},
]
codeJson = {
    "p0": {
        "paramInfoId": "4dfeda26-3039-4cd7-a8c4-3045d952ce89",
        "sectionId": "e580c968-b48e-47d9-ab85-b55b951a9444",
    },
    "s0": {"sectionId": "e580c968-b48e-47d9-ab85-b55b951a9444"},
}

value = get_str_from_value(from_frontend, codeJson)
x = f"import torch;s0=[3];x={value}"
print(x)
results = jedi.Script(x).complete()
output = []
# from_frontend_excluding_last = from_frontend[:-1]
# is_completing_raw = from_frontend[-1]["type"] == "raw"
for r in results:
    if r.name in codeJson and r.type == "statement":
        x = {
            "type": "ref",
            "value": codeJson[r.name]["sectionId"],
        }
        ff_copy = copy.deepcopy(from_frontend)
        ff_copy[-1]["value"] = ff_copy[-1]["value"][:r.get_completion_prefix_length()]
        new_entry = [*ff_copy, x]

    else:
        x = {
            "type": "raw",
            "value": r.complete,
        }
        x["value"] = f"{from_frontend[-1]['value']}{x['value']}"
        new_entry = [*from_frontend[:-1], x]
    
    output.append(new_entry)


pprint(output)
