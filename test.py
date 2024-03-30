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
