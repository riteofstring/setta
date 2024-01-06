# import jedi
# from pprint import pprint
# from runcoder.code.utils import get_str_from_value, get_value_from_completions
# import string
# import copy


# def append_will_change_var_name(char_to_append):
#     # Check if the original string is a valid identifier
#     # if not var_name.isidentifier():
#     #     raise ValueError("The provided string is not a valid Python identifier")
#     # Check if the character to append is a letter, digit, or underscore
#     if char_to_append in string.ascii_letters + string.digits + "_":
#         return True  # Appending will result in a new variable name
#     else:
#         return False  # Appending will not create a valid variable name, possibly an operator


# from_frontend = [
#     {"type": "ref", "value": "e580c968-b48e-47d9-ab85-b55b951a9444"},
#     {"type": "raw", "value": "+s"},
# ]
# codeJson = {
#     "p0": {
#         "paramInfoId": "4dfeda26-3039-4cd7-a8c4-3045d952ce89",
#         "sectionId": "e580c968-b48e-47d9-ab85-b55b951a9444",
#     },
#     "s0": {"sectionId": "e580c968-b48e-47d9-ab85-b55b951a9444"},
# }

# value = get_str_from_value(from_frontend, codeJson)
# x = f"import torch;s0=[3];x={value}"
# print(x)
# results = jedi.Script(x).complete()
# output = get_value_from_completions(codeJson, results, from_frontend)

# pprint(output)


# from runcoder.code.export_selected import export_selected
# from runcoder.code.generate_code import generate_code
# import json
# from pprint import pprint

# with open("python/runcoder/backend/seedData/exampleProjects/diffusionDrops.json") as f:
#     p = json.load(f)

# with open("python/runcoder/backend/seedData/BaseUITypes.json") as f:
#     u = json.load(f)

# config = p.pop("configs")
# config["uiTypes"].update(u)
# p.update(config)

# e = export_selected(p)
# pprint(e)

# print(generate_code(e)[0])


# import ast

# root = ast.parse("x=5\nyy=3\nz=2")

# names = [node.id for node in ast.walk(root) if isinstance(node, ast.Name)]
# print(names)


# import sklearn.cluster
# import sklearn.datasets

# n_samples=4000
# n_clusters=4
# p0=n_samples
# p3=n_clusters
# p4=0.6
# p7=0
# dataset=sklearn.datasets.make_blobs(n_samples=p0, centers=p3, cluster_std=p4, random_state=p7)
# p10=dataset[0][:,::-1]
# p11=n_clusters
# p15=0
# algorithm=sklearn.cluster.kmeans_plusplus(X=p10, n_clusters=p11, random_state=p15)

# def test():
#     try:
#         return 5
#     finally:
#         print("still printed")

# result = test()
# print(result)

# import subprocess
# import time

# def stream_process(process):
#     go = process.poll() is None
#     for line in process.stdout:
#         print(line)
#     return go

# process = subprocess.Popen("python runcoder_temp.py", shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
# while stream_process(process):
#     time.sleep(0.1)

# # process = subprocess.run(, shell=True, capture_output=True, text=True, check=True)
# with subprocess.Popen("bash runcoder_temp.sh", stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True, text=True, bufsize=1) as process:
#     for line in process.stdout:
#         print(line)

# import subprocess
# import sys

# process = subprocess.Popen(["python3", "runcoder_temp.py"], stdout=subprocess.PIPE)
# for c in iter(lambda: process.stdout.read(1), b""):
#     print(c)
#     # f.buffer.write(c)


# import subprocess
# import sys
# with subprocess.Popen("bash runcoder_temp.sh", shell=True) as process:
#     pass
#     # for line in process.stdout:
#     #     print(line.decode('utf8'))


# from runcoder.code.generate_code import infer_imports

# code = """import numpy as np


# n_samples=4000

# n_clusters=4

# special_array=numpy.array([1,2,3])

# p0=n_samples

# p3=n_clusters

# p4=0.6

# p7=0

# dataset=sklearn.datasets.make_blobs(n_samples=p0, centers=p3, cluster_std=p4, random_state=p7)

# p10=dataset[0][:,::-1]

# p11=n_clusters

# p15=0

# algorithm=sklearn.cluster.kmeans_plusplus(X=p10, n_clusters=p11, random_state=p15)

# x = torch.tensor() + torchvision.models.resnet101()


# print("here")
# """


# code = "from torchvision import models\nimport numpy as np\nx = numpy.array([1,2,3])\nmodel=models.resnet101()\ny=torch.tensor([1,2,3]) + jax.tensor([1,2,3]) + some.library.that.looks.like.this()"

# code = "x=torch.nn.CrossEntropyLoss(".rstrip(".(")

# print(infer_imports(code))


# def count_lines(string):
#     line_count = string.count('\n')
#     if string.endswith('\n'):
#         line_count -= 1
#     return line_count + 1  # Adjusting for the last line

# # Example usage
# sample_string = "import numpy as np\n\nSPECIAL_THING\n\nmorelines\n\n"
# print(sample_string, end="")
# number_of_lines = count_lines(sample_string.split("SPECIAL_THING")[0])
# print(number_of_lines)  # Output will be 1


# from runcoder.code.export_selected import export_selected
# from runcoder.code.generate_code import generate_code
# import json
# from pprint import pprint
# import yaml

# with open("python/runcoder/backend/seedData/exampleProjects/sklearn_example.json") as f:
#     p = json.load(f)

# with open("python/runcoder/backend/seedData/BaseUITypes.json") as f:
#     u = json.load(f)

# config = p.pop("configs")[0]
# config["uiTypes"].update(u)
# p.update(config)
# for s in p["sections"].values():
#     if "currChildren" not in s:
#         s["currChildren"] = []

# e = export_selected(p)

# for k,v in e.items():
#     v.pop("sectionId",None)
#     v.pop("paramInfoId",None)
#     v.pop("type",None)
#     if isinstance(v["value"], dict):
#         v["value"].pop("unusedParams", None)


# pprint(e)


# def create_yaml_dict(e):
#     transformed_dict = {}
#     for key, value in e.items():
#         if 'value' in value and isinstance(value['value'], dict):
#             # Handle nested structure for keys like 'dataset' and 'algorithm'
#             callable_value = value['value']['callable']
#             params = value['value'].get('params', [])
#             param_dict = {}
#             for param in params:
#                 param_value = e[param]['value']
#                 # Resolve references to other keys (like 'n_samples' for 'p0')
#                 if param_value in e:
#                     param_value = e[param_value]['value']
#                 param_dict[e[param]['name']] = param_value
#             transformed_dict[key] = {callable_value: param_dict}
#         elif not value["var_name_generated"]:
#             # Directly use top-level keys and values
#             transformed_dict[key] = value['value']

#     pprint(transformed_dict)
#     return yaml.safe_dump(transformed_dict)

# yaml_dict = create_yaml_dict(e)

# print(yaml_dict)


# # with open("test.yaml", 'w') as f:
# #     print(yaml.safe_dump(yaml_dict, f))


# def count_lines(string):
#     if not string:  # Check if the string is empty
#         return 0
#     line_count = string.count("\n")
#     if string.endswith("\n"):
#         line_count -= 1
#     return line_count + 1  # Adjusting for the last line

# # Example usage
# delimiter = "dog"
# example_string = "cat\ndog"
# print(count_lines(example_string.split(delimiter)[0]))


import argparse


def main():
    parser = argparse.ArgumentParser(description="Example script using argparse.")

    parser.add_argument("--name", type=str, help="Your name", required=True)
    parser.add_argument("--age", type=int, help="Your age", required=True)
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    parser.add_argument(
        "--number", type=int, default=0, help="An example integer flag", required=True
    )

    args = parser.parse_args()

    if args.verbose:
        print("Verbose mode is enabled.")
    print(f"Hello, {args.name}! You are {args.age} years old.")
    print(f"The number provided is {args.number}.")


if __name__ == "__main__":
    main()


