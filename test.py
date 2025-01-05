# import yaml
# from yaml.representer import SafeRepresenter
# import ast

# from pprint import pprint
# def represent_str(dumper, data):
#     if data in ["True", "true", "False", "false"]:
#         return dumper.represent_scalar('tag:yaml.org,2002:bool', data)
#     elif data.replace('.', '', 1).isdigit() and data.count('.') <= 1:  # Check for integers and floats
#         return dumper.represent_scalar('tag:yaml.org,2002:float' if '.' in data else 'tag:yaml.org,2002:int', data)
#     elif data.startswith('[') and data.endswith(']'):  # Check for a list-like string
#         try:
#             parsed_list = ast.literal_eval(data)  # Safely parse the string into a Python list
#             if isinstance(parsed_list, list):
#                 return dumper.represent_sequence('tag:yaml.org,2002:seq', parsed_list, flow_style=True)
#         except (ValueError, SyntaxError):
#             pass  # If parsing fails, treat it as a string
#     elif data.startswith('{') and data.endswith('}'):  # Check for a dict-like string
#         try:
#             parsed_dict = ast.literal_eval(data)  # Safely parse the string into a Python dict
#             if isinstance(parsed_dict, dict):
#                 return dumper.represent_mapping('tag:yaml.org,2002:map', parsed_dict, flow_style=True)
#         except (ValueError, SyntaxError):
#             pass  # If parsing fails, treat it as a string
#     elif data.startswith('"') and data.endswith('"'):  # Check for a string enclosed in double quotes
#         return dumper.represent_scalar('tag:yaml.org,2002:str', data[1:-1], style='"')
#     elif data.startswith("'") and data.endswith("'"):  # Check for a string enclosed in single quotes
#         return dumper.represent_scalar('tag:yaml.org,2002:str', data[1:-1], style="'")
#     return dumper.represent_scalar('tag:yaml.org,2002:str', data)

# class PythonSectionDumper(yaml.Dumper):
#     pass


# PythonSectionDumper.add_representer(str, represent_str)

# Test data
from setta.code_gen.yaml.section_dict import raw_dump


data = {
    "sign": '"cancer"',
    "another_sign": "'gemini'",
    "numbers": 'yellow+"black"',
    "dog": "5",
    "tiger": "5.16",
    "lion": "5.16.123",
    "cat": "True",
    "giraffe": 'true',
    "an_expression": "torch.tensor([1,2,3])",
    "a_list": "[1,2,3]",
    "a_tuple": "(1,2,3)",
    "a_dict": "{'building': 'tall', 'elements': ['gold', 'silver']}",
    "name": '{"kevin": {"height": "170"}}',
    "nested": {"john": [1,2,3], "jacob": {"wow": "dog"}},
    "bio": '"""a triple quoted string!\nwow!\ncool"""',
    "address": {
        "street": "123 Main St",
        "notes": "Ring twice\nUse back door\nAnd say \"hello!\""
    }
}

print(raw_dump(data))
# print(raw_dump(data, wrap_values_with_quotes=True))