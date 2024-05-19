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

# with open("seed/exampleProjects/diffusionDrops.json") as f:
#     p = json.load(f)

# with open("seed/BaseUITypes.json") as f:
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

# with open("seed/exampleProjects/sklearn_example.json") as f:
#     p = json.load(f)

# with open("seed/BaseUITypes.json") as f:
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


# import argparse


# def main():
#     parser = argparse.ArgumentParser(description="Example script using argparse.")

#     parser.add_argument("--name", type=str, help="Your name", required=True)
#     parser.add_argument("--age", type=int, help="Your age", required=True)
#     parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
#     parser.add_argument(
#         "--number", type=int, default=0, help="An example integer flag", required=True
#     )

#     args = parser.parse_args()

#     if args.verbose:
#         print("Verbose mode is enabled.")
#     print(f"Hello, {args.name}! You are {args.age} years old.")
#     print(f"The number provided is {args.number}.")


# if __name__ == "__main__":
#     main()




# import os
# import pty
# import subprocess

# def read_from_fd(fd):
#     """ Read data from file descriptor. """
#     while True:
#         try:
#             data = os.read(fd, 1024)
#             if not data:
#                 break
#             yield data
#         except OSError:
#             break

# def run_subprocess_with_pty(command):
#     """ Run a subprocess with a pseudo-terminal. """
#     # Create a pseudo-terminal pair
#     master_fd, slave_fd = pty.openpty()

#     # Start the subprocess with the slave end of the pty as its controlling terminal
#     process = subprocess.Popen(command, stdin=slave_fd, stdout=slave_fd, stderr=subprocess.STDOUT, close_fds=True)

#     # Close the slave end in the parent process
#     os.close(slave_fd)

#     # Read output from the master end of the pty
#     for output in read_from_fd(master_fd):
#         os.write(1, output)  # Write to standard output

#     # Wait for the subprocess to finish
#     process.wait()

#     # Close the master end
#     os.close(master_fd)


# run_subprocess_with_pty("python test2.py")



# import os
# import threading
# from winpty import PtyProcess

# def read_from_process(process):
#     """ Read data from the subprocess and write it to the script's stdout. """
#     while True:
#         try:
#             output = process.read(1024)
#             if not output:
#                 break
#             os.write(1, output.encode('utf-8'))
#         except EOFError:
#             break

# def write_to_process(process):
#     """ Read data from the script's stdin and write it to the subprocess. """
#     try:
#         while True:
#             inp = input()
#             if inp == "\x03":
#                 process.sendintr()
#             else:
#                 process.write(inp + '\n')
#     except EOFError:
#         pass

# def run_interactive_subprocess(command):
#     """ Run a subprocess interactively with a pseudo-terminal. """
#     process = PtyProcess.spawn(command)

#     # Create threads for reading from and writing to the subprocess
#     read_thread = threading.Thread(target=read_from_process, args=(process,))
#     write_thread = threading.Thread(target=write_to_process, args=(process,))

#     # Start the threads
#     read_thread.start()
#     write_thread.start()

#     # Wait for the subprocess to complete
#     # process.sendintr()
#     # assert process.wait() != 0

#     # Close threads
#     read_thread.join()
#     write_thread.join()

# # Example command
# command = ['python', 'test2.py']

# run_interactive_subprocess(command)


# process = PtyProcess.spawn("python test2.py")
# process.sendintr()
# assert process.wait() != 0




# def get_wsl_processes():
#     # Run 'ps -ef' in WSL to get process details
#     output = subprocess.check_output("ps -ef", shell=True).decode()

#     # Parse the output
#     processes = []
#     for line in output.split('\n')[1:]:  # Skip the header line
#         columns = re.split(r'\s+', line)
#         if len(columns) >= 8:
#             pid, ppid, _, _, _, _, _, cmd = columns[:8]
#             processes.append({'pid': pid, 'ppid': ppid, 'cmd': cmd})
#     return processes

# def find_child_processes(parent_pid, processes):
#     return [p for p in processes if p['ppid'] == parent_pid]

# # Example usage
# processes = get_wsl_processes()
# children = find_child_processes('2092', processes)  # Replace with your parent PID
# print(children)


# import subprocess
# import re
# import psutil


# def has_child_processes(input_winpid):
#     if len(psutil.Process(input_winpid).children()) > 0:
#         return True

#     output = subprocess.check_output("ps", shell=True).decode()
#     processes = []
#     bash_pid = None
#     pid_idx, ppid_idx, winpid_idx = None, None, None
#     for i,line in enumerate(output.split('\n')):  # Skip the header line
#         columns = re.split(r'\s+', line)
#         if i==0:
#             pid_idx = columns.index("PID")
#             ppid_idx = columns.index("PPID")
#             winpid_idx = columns.index("WINPID")
#         elif columns != ['']:
#             pid = int(columns[pid_idx])
#             ppid = int(columns[ppid_idx])
#             winpid = int(columns[winpid_idx])
#             processes.append({"pid": pid, "ppid": ppid, "winpid": winpid})
#             if winpid == input_winpid:
#                 bash_pid = pid

#     return len([p for p in processes if p['ppid'] == bash_pid]) > 0

    


# def main():
#     bash_pid, processes = get_bash_pid(7520)
#     print(bash_pid)
#     print(find_child_processes(bash_pid, processes))
#     print(psutil.Process(7520).children())



# main()

# def topological_sort(objects):
#     graph = {id: refs for id, refs in objects.items()}
#     visiting, visited = set(), set()
#     order = []

#     def dfs(node):
#         if node in visiting:
#             raise ValueError("Circular reference detected")
#         if node not in visited:
#             visiting.add(node)
#             for neighbour in graph[node]:
#                 dfs(neighbour)
#             visiting.remove(node)
#             visited.add(node)
#             order.append(node)

#     for id in objects.keys():
#         if id not in visited:
#             dfs(id)

#     return order[::-1]

# # Example usage
# objects = {"A": [], "B": ["A"]}
# sorted_objects = topological_sort(objects)
# print(sorted_objects)


# import os
# from datetime import datetime



# def create_timestamped_folder(base_dir, prefix=''):
#     # Ensure the base directory exists, if not, create it
#     if not os.path.exists(base_dir):
#         os.makedirs(base_dir)
#     # Format the current timestamp using datetime.datetime.now()
#     timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
#     # Create folder name with optional prefix
#     folder_name = f"{prefix}{timestamp}"
#     # Full path for the new folder
#     folder_path = os.path.join(base_dir, folder_name)
#     # Create the timestamped folder
#     os.makedirs(folder_path)
#     return folder_path

# create_timestamped_folder(".runcoder_code", "")


# import sqlite3
# import json
# import yaml

# def fetch_schema(cursor):
#     """Fetch the schema of all tables in the database."""
#     cursor.execute("SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL;")
#     schema = {}
#     for type, name, sql in cursor.fetchall():
#         if name not in schema:
#             schema[name] = {'type': type, 'sql': sql}
#     return schema

# def fetch_all_data(cursor):
#     """Fetch all data from the database."""
#     data = {}
#     cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
#     for table_name, in cursor.fetchall():
#         cursor.execute(f"SELECT * FROM {table_name}")
#         columns = [description[0] for description in cursor.description]
#         data[table_name] = [dict(zip(columns, row)) for row in cursor.fetchall()]
#     return data

# def export_database(cursor, json_filepath='database.json', yaml_filepath='database.yaml'):
#     """Export the entire database to JSON and YAML, including schema."""
#     schema = fetch_schema(cursor)
#     data = fetch_all_data(cursor)
    
#     # Combined schema and data for JSON export
#     database_export = {'schema': schema, 'data': data}
#     with open(json_filepath, 'w') as file:
#         json.dump(database_export, file, indent=4)

#     # Customize the YAML dump to use literal style for SQL
#     def literal_presenter(dumper, data):
#         if '\n' in data:
#             return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='|')
#         return dumper.represent_scalar('tag:yaml.org,2002:str', data)
    
#     yaml.add_representer(str, literal_presenter)
    
#     # For YAML export, PyYAML is used; ensure it's installed
#     with open(yaml_filepath, 'w') as file:
#         yaml.dump(database_export, file, allow_unicode=True)

# # Replace 'your_database.db' with the path to your SQLite database
# database_path = 'runcoder.db'

# # Connect to the SQLite database
# conn = sqlite3.connect(database_path)
# cursor = conn.cursor()

# # Export the database, including schema and data, to JSON and YAML
# export_database(cursor)

# # Close the database connection
# conn.close()













# import sqlite3
# import yaml

# def create_database_from_yaml(yaml_filepath, new_database_path):
#     with open(yaml_filepath, 'r') as file:
#         database_content = yaml.safe_load(file)
    
#     conn = sqlite3.connect(new_database_path)
#     cursor = conn.cursor()
    
#     for table_name, table_info in database_content['schema'].items():
#         sql = table_info['sql']
#         cursor.execute(sql)
    
#     for table_name, rows in database_content['data'].items():
#         if not rows:
#             continue
#         # Quote column names to handle reserved keywords
#         columns = ['"' + column + '"' for column in rows[0].keys()]
#         placeholders = ', '.join(['?'] * len(columns))
#         sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
#         for row in rows:
#             cursor.execute(sql, list(row.values()))
    
#     conn.commit()
#     conn.close()

# yaml_filepath = 'database.yaml'
# new_database_path = 'new_database.db'
# create_database_from_yaml(yaml_filepath, new_database_path)

# import jedi

# x = "models = [{'pretrained': True}]\nmodels[0]["
# print(x)
# results = jedi.Script(x).complete()
# for c in results:
#     print(c)


evRefs = {
    "default": {
        "4253da34-9a1a-43eb-b80f-c6708e339024": {
            "name": "substantial_brown",
            "values": {
                "0a8a909f-4821-4880-81ac-373b1ce09084": [],
                "3ab421e7-1f82-4baa-a0bc-44875bf13adc": [],
                "5ca935ba-3c2e-4ebd-a647-bb2db0020e19": [],
                "944abf2e-f5ec-47c7-9286-370faa75c3bf": [],
                "d23a2f7f-017d-4afa-ac90-4ae3aeb2c819": [],
                "d7b84c56-ded8-4ec2-9742-81f6850c9cf8": [],
                "e5a2037f-60a7-4052-bb72-0763319f6000": [],
                "ffeb5e40-5c66-4e31-a47a-6eac10385294": []
            }
        },
        "756e7bb0-ac13-4790-a05c-f10425d508e9": {
            "name": "secure_jade",
            "values": {
                "4a447d64-aa9e-4fff-8b5c-a6a2ace04c25": [],
                "7a9b411c-e319-4813-8bf2-f341cf05df4a": [
                    {
                        "sectionId": "93b410c0-33e9-4d66-95be-37d223d99c0a",
                        "paramInfoId": None,
                        "isArgsObj": True,
                        "startPos": 8,
                        "endPos": 19
                    }
                ],
                "b6862dbf-ddfd-4465-b4e5-fdb6a3ebbab1": []
            }
        },
        "8481e81d-f417-4914-b5d8-2797202392ab": {
            "name": "fast_gray",
            "values": {}
        },
        "9083beca-25c9-4a31-885a-fb19064efd3d": {
            "name": "yeasty_magenta",
            "values": {
                "0a62f48a-54e6-4871-afa6-95c09bc49d61": [
                    {
                        "sectionId": "5d1b3653-766a-4290-9da5-1cdee8f54c24",
                        "paramInfoId": None,
                        "isArgsObj": False,
                        "startPos": 0,
                        "endPos": 18
                    }
                ]
            }
        },
        "9b39ad4c-8887-43ea-b759-a1fc067ac3ef": {
            "name": "central_amethyst",
            "values": {}
        },
        "a853185e-5b0d-400a-a94c-6c14a9c9809e": {
            "name": "vivid_moccasin",
            "values": {
                "17f3f1d8-4459-4d8b-a132-ab42df1bf241": [],
                "2acbcb71-f180-42b0-94bf-46edfe809de3": [],
                "5fda1f62-0834-41de-a58e-2fe7f0e97558": [],
                "681f4df7-ddd9-4a84-979f-ff0d243cdbff": [],
                "6b52f167-e867-41c6-a398-4253147c5672": [],
                "83f732ba-1244-40aa-b189-c324d1cbbccb": [],
                "aa45a0fa-bc33-420a-9b1b-88792303e0a7": [],
                "f2098038-2341-47cc-95d1-c4653b1ba1d3": []
            }
        },
        "c1873fea-a24d-4367-97b1-88614045a575": {
            "name": "wet_teal",
            "values": {
                "1642efb6-c5cd-41e1-b346-cacb44d43c87": [],
                "197c09ec-176b-4b63-99d5-94522b8fc6f3": [],
                "47377fe6-a365-4540-bf8a-468788f754e0": [],
                "5efb2418-747c-4bba-b1b6-0d53cac2ab40": [],
                "810b3251-8d80-42f2-b01a-e36ec47928f8": [],
                "b8036ace-03dd-4dc3-88c5-069957276d1d": [],
                "c26ed01f-d91a-4fa1-8ec8-cfa938b29c86": [],
                "fc3182cc-369b-4a19-811f-b5e8c6d182c3": []
            }
        },
        "c58d323d-382a-47b2-919f-a7f06bcac760": {
            "name": "secure_tan",
            "values": {
                "3fdec365-9d3f-4f5b-94fe-75adbb767d08": []
            }
        },
        "dbb76902-0b6c-46fa-a765-46bdfcf92d92": {
            "name": "horizontal_green",
            "values": {
                "0472a28a-cc7b-42e7-8628-173a7b953214": [],
                "13df1e1a-b6a6-49e5-bd57-992a5bcdd4ac": [],
                "31d94ca2-5b68-41f5-8380-ad62348ef1b0": [],
                "44a300eb-c969-41fc-95e4-dcf3a5716d6e": [],
                "4cc2b16e-0946-44de-85e6-131ccc8dec41": [],
                "62bd6021-0834-4317-87f4-3961d8f2e890": [],
                "6553f807-4fc6-40d2-9df1-990bf1b094f5": [],
                "6c3fae29-caa1-4650-a2c4-7a1b1a816929": [],
                "bbb754a2-06e5-4b57-8e5d-308865f81a94": [],
                "d9a35253-835b-425d-abdf-2a678ddc1924": [],
                "f807b59d-a434-41b6-a54c-9b35ffb61c8d": [
                    {
                        "sectionId": "fa8f5823-fd6b-43f0-a2df-a47e821de0de",
                        "paramInfoId": None,
                        "isArgsObj": False,
                        "startPos": 0,
                        "endPos": 5
                    }
                ]
            }
        },
        "fb08c4e1-9809-46ef-bfa5-52a4a944ef74": {
            "name": "marginal_coral",
            "values": {}
        }
    }
}


# evRefs = {
#     "default": {
#         "1fc1e842-82fe-4a48-8794-23178822e22e": {
#             "name": "carrot_soup",
#             "values": {
#                 "3e754333-caea-451a-abba-dd254c49502f": [],
#                 "6f1450ea-93cf-441e-9bfd-5e6633b4a0a2": [],
#                 "7ae757c9-9327-4931-95a3-bc200f7e10b7": [
#                     {
#                         "sectionId": "d96cb110-6f72-435a-b745-2d55e277f983",
#                         "paramInfoId": None,
#                         "startPos": 0,
#                         "endPos": 7
#                     }
#                 ],
#                 "7b4b2118-7cbf-4275-8582-90c66a966441": [],
#                 "8a13dbf9-e4ee-4310-bd89-2a1a9f2812f5": [],
#                 "97e83315-adfc-4d50-a8ab-a8c34082eb93": [
#                     {
#                         "sectionId": "46dc6cab-03ac-4e73-919d-63b30da0688d",
#                         "paramInfoId": "4e70c873-ead7-4c5a-b3a0-fe504e73ad27",
#                         "startPos": 0,
#                         "endPos": 10
#                     }
#                 ],
#                 "c066af9f-42b4-4359-8b44-cf774c400e81": [],
#                 "c2c05abc-dd95-4071-8f37-cb2019919bce": []
#             }
#         },
#         "22f7a029-5660-4f3d-ba54-e79637f2ba61": {
#             "name": "tremendous_tree",
#             "values": {
#                 "3e754333-caea-451a-abba-dd254c49502f": [],
#                 "6f1450ea-93cf-441e-9bfd-5e6633b4a0a2": [],
#                 "7ae757c9-9327-4931-95a3-bc200f7e10b7": [
#                     {
#                         "sectionId": "d96cb110-6f72-435a-b745-2d55e277f983",
#                         "paramInfoId": None,
#                         "startPos": 0,
#                         "endPos": 7
#                     }
#                 ],
#                 "7b4b2118-7cbf-4275-8582-90c66a966441": [],
#                 "8a13dbf9-e4ee-4310-bd89-2a1a9f2812f5": [],
#                 "97e83315-adfc-4d50-a8ab-a8c34082eb93": [
#                     {
#                         "sectionId": "46dc6cab-03ac-4e73-919d-63b30da0688d",
#                         "paramInfoId": "4e70c873-ead7-4c5a-b3a0-fe504e73ad27",
#                         "startPos": 0,
#                         "endPos": 10
#                     }
#                 ],
#                 "c066af9f-42b4-4359-8b44-cf774c400e81": [],
#                 "c2c05abc-dd95-4071-8f37-cb2019919bce": []
#             }
#         },
#         "3383d9b9-5cee-445f-a242-fde820c76c73": {
#             "name": "superb_jade",
#             "values": {}
#         },
#         "54571c59-7a51-42d5-bb8e-b6c06b41b023": {
#             "name": "purple_onion",
#             "values": {
#                 "4e70c873-ead7-4c5a-b3a0-fe504e73ad27": [],
#                 "6da7a4ce-cf7a-4770-95c4-1ab78b9f80e4": []
#             }
#         },
#         "66e4192c-c1fc-4935-b862-e722726c1217": {
#             "name": "water_fall",
#             "values": {
#                 "03ee6530-d464-461c-a989-b310ee2d9b95": [],
#                 "0aa0f46a-e923-4528-a411-500cbda6e77b": [
#                     {
#                         "sectionId": "46dc6cab-03ac-4e73-919d-63b30da0688d",
#                         "paramInfoId": "6da7a4ce-cf7a-4770-95c4-1ab78b9f80e4",
#                         "startPos": 0,
#                         "endPos": 9
#                     }
#                 ],
#                 "159e0416-3873-469b-915b-1f186579c380": [],
#                 "1ea1732e-ccae-4c4f-b26a-c9b1b83f43af": [],
#                 "2fae73d3-5756-42a9-beb0-7465b92ac626": [],
#                 "39ed839d-f632-4373-9d72-6ce95b5bc265": [],
#                 "3e15081a-9ca5-48bf-9159-9a95331a7894": [],
#                 "669986a2-03d6-4de4-af41-f9395cf0ef57": [],
#                 "70f4e095-c286-4379-a5f5-4d02df40e1a5": [],
#                 "8a10b368-9a0e-4390-b2f7-bd4ff27570d3": [
#                     {
#                         "sectionId": "46dc6cab-03ac-4e73-919d-63b30da0688d",
#                         "paramInfoId": "4e70c873-ead7-4c5a-b3a0-fe504e73ad27",
#                         "startPos": 0,
#                         "endPos": 10
#                     }
#                 ]
#             }
#         },
#         "69220358-73c1-49c3-9b78-d7cf733b2aa8": {
#             "name": "green_grass",
#             "values": {}
#         },
#         "8a94f3ef-63e3-477b-a5ed-98f78358b427": {
#             "name": "round_red",
#             "values": {}
#         },
#         "9a6859c2-a79d-4da2-b460-b57fc982d495": {
#             "name": "inland_apricot",
#             "values": {}
#         },
#         "e007e751-1687-43ff-91e5-faeb1f7d15dc": {
#             "name": "yodelling_copper",
#             "values": {}
#         },
#         "fb460dcd-d460-44fc-aeae-b0b8aca93c5b": {
#             "name": "worthwhile_crimson",
#             "values": {}
#         },
#         "fca181fc-c326-4d50-b028-37b368372f49": {
#             "name": "apple_pear",
#             "values": {}
#         }
#     }
# }



# from runcoder.code.export_selected import export_selected, get_code
# from runcoder.code.generate_code import generate_code, generate_lines_of_code_without_imports
# from runcoder.code.infer_imports import infer_imports
# from runcoder.code.utils import process_refs
# import json
# import black
# import isort
# from pprint import pprint

# with open("seed/exampleProjects/diffusionDrops/diffusionDrops.json") as f:
#     p = json.load(f)

# with open("seed/BaseUITypes.json") as f:
#     u = json.load(f)

# config = p.pop("configs")[1]
# config["uiTypes"].update(u)
# config["project"] = {"id": p["id"]}
# for v in config["sections"].values():
#     if "dbSource" not in v:
#         v["dbSource"] = ""
# config["evRefs"] = evRefs

# e = export_selected(config)
# # for k,v in e.items():
# #     print(k)
# #     pprint(v)
# #     print("\n\n")
# templated_code = get_code(config)

# code = generate_code(e.output, templated_code)[0]
# # code = "\n".join(code)
# code = black.format_file_contents(code, fast=False, mode=black.Mode(target_versions={black.TargetVersion.PY311}, line_length=120))
# code = isort.code(code, profile="black")
# print(code)
# # print(infer_imports(code))



# print(process_refs("2+list_of_transforms+3 + model", [
#                     {
#                         "sectionId": "5d1b3653-766a-4290-9da5-1cdee8f54c24",
#                         "paramInfoId": None,
#                         "isArgsObj": False,
#                         "startPos": 2,
#                         "endPos": 20
#                     },
#                     {
#                         "sectionId": "fa8f5823-fd6b-43f0-a2df-a47e821de0de",
#                         "paramInfoId": None,
#                         "isArgsObj": False,
#                         "startPos": 25,
#                         "endPos": 30
#                     }
#                 ], e.get_ref_var_name, position=30))








import inspect

class MyClass:
    def __init__(self, name, value):
        self.name = name
        self.value = value

    @property
    def label(self):
        return f"{self.name}-{self.value}"

def obj_to_dict(obj):
    attributes = vars(obj)  # or obj.__dict__
    properties = {name: getattr(obj, name) for name, value in inspect.getmembers(type(obj))
                  if isinstance(value, property)}
    return {**attributes, **properties}

# Example usage
obj = MyClass("test", 123)
converted = obj_to_dict(obj)
print(converted)
