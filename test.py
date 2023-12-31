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

# config = p.pop("configs")[1]
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


import subprocess
import sys
with subprocess.Popen("bash runcoder_temp.sh", shell=True) as process:
    pass
    # for line in process.stdout:
    #     print(line.decode('utf8'))


