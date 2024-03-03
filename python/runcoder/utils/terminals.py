import asyncio
import json
import platform
import time
from asyncio import CancelledError

import psutil
from fastapi import WebSocketDisconnect

from runcoder.code.export_selected import export_selected, get_script, get_section_type
from runcoder.code.find_placeholders import needs_python_code, needs_yaml, double_braces, needs_python_argparse
from runcoder.code.generate_code import generate_code, generate_script, generate_argparse, replace_keywords
from runcoder.code.generate_yaml import generate_yaml
from runcoder.processors.utils import withTempFiles
from runcoder.utils.constants import CODE
import copy

if platform.system() == "Windows":
    from winpty import PtyProcess

    from .terminal_utils import windows_has_child_processes as has_child_processes

    TERMINAL_NAME = "bash.exe"
else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

    from .terminal_utils import linux_has_child_processes as has_child_processes

    TERMINAL_NAME = ["zsh"]


PTY_PIDS = {}


def is_command_running_in_pty(pid):
    try:
        return has_child_processes(pid)
    except psutil.NoSuchProcess:
        return False


def get_free_terminal():
    for k, v in PTY_PIDS.copy().items():
        if not is_command_running_in_pty(v["pid"]) and time.time() - v["start"] > 1:
            return k
    return None


def set_terminal_start_time(id):
    PTY_PIDS[id]["start"] = time.time()


async def start_terminal(terminal_websocket, id):
    # Main event loop
    loop = asyncio.get_event_loop()

    # Start the WinPTY terminal
    pty_process = PtyProcess.spawn(TERMINAL_NAME)
    PTY_PIDS[id] = {"pid": pty_process.pid, "start": time.time()}

    # Function to read from the terminal
    async def read_from_terminal():
        try:
            while True:
                output = await loop.run_in_executor(None, pty_process.read, 1024)
                if not output:
                    break
                # Send output to WebSocket
                await terminal_websocket.send_text(output)
        except (WebSocketDisconnect, CancelledError):
            pass

    # Function to write to the terminal
    async def write_to_terminal():
        try:
            while True:
                input_data = await terminal_websocket.receive_text()
                try:
                    json_val = json.loads(input_data)
                    if isinstance(json_val, dict):
                        if json_val["type"] == "resize":
                            pty_process.setwinsize(json_val["rows"], json_val["cols"])
                        elif json_val["type"] == "runCode":
                            runCode(json_val, pty_process.write)
                            set_terminal_start_time(id)
                        continue
                except json.decoder.JSONDecodeError:
                    pass
                if input_data is None:
                    break
                # Write received data to the terminal
                pty_process.write(input_data)
                set_terminal_start_time(id)
        except (WebSocketDisconnect, CancelledError):
            pass

    try:
        # Start reading from and writing to the terminal
        read_task = loop.create_task(read_from_terminal())
        write_task = loop.create_task(write_to_terminal())

        # Wait for either task to complete
        _, pending = await asyncio.wait(
            [read_task, write_task], return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel the remaining tasks
        for task in pending:
            task.cancel()
            await task  # Ensure task is properly cancelled
    finally:
        # Cleanup
        pty_process.terminate()
        del PTY_PIDS[id]


def runCode(message, terminal_write_fn):
    p = message["message"]
    selected = export_selected(p)
    folder_path = create_timestamped_folder(".runcoder_code")

    code_sections = {id:copy.deepcopy(s) for id,s in p["sections"].items() if get_section_type(p, s["id"]) == CODE}
    dependencies = []
    for s in code_sections.values():
        curr_code = s["code"]
        curr_dependencies = []
        replacements = {}
        for other_s in code_sections.values():
            if double_braces(other_s["name"]) in curr_code:
                replacements[other_s["name"]] = codePathStr(folder_path, other_s['name'], other_s["codeLanguage"])
                curr_dependencies.append(other_s["id"])
        if needs_python_argparse(curr_code):
            replacements["RUNCODER_PYTHON_ARGPARSE"] = generate_argparse(selected)
        if needs_yaml(curr_code):
            replacements["RUNCODER_YAML_FILE"] = codePathStr(folder_path, "RUNCODER_YAML", "yaml")
        
        s["code"] = replace_keywords(s["code"], replacements)
        dependencies.append({"id": s["id"], "refs": curr_dependencies})

    
    to_write = topological_sort(dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_section = code_sections[sid]
        extension = languageToExtension(curr_section["codeLanguage"])
        filepath = write_string_to_file(folder_path, f"{curr_section['name']}{extension}", curr_section["code"])
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        id_to_filepath[sid] = filepath


    # If none of the code sections refer to any others, then run all.
    # Otherwise, only run code sections that have references to others.
    if all(len(x["refs"]) == 0 for x in dependencies):
        run_order = to_write
    else:
        run_order = [x["id"] for x in dependencies if len(x["refs"]) > 0]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        bash_script = ""
        for sid in run_order:
            curr_section = code_sections[sid]
            bash_script += codeCallStr(folder_path, curr_section)
        filepath = write_string_to_file(folder_path, f"RUNCODER_ENTRY.sh", bash_script)
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        terminal_write_fn(f"\x15bash {filepath}\n")
    else:
        sid = run_order[0]
        filepath = id_to_filepath[sid]
        callingProgram = languageToCall(code_sections[sid]["codeLanguage"])
        terminal_write_fn(f"\x15{callingProgram} {filepath}\n")


    # unprocessed_script = get_script(p)
    # write = []
    # in_file_with_suffix = []
    # if needs_python_code(unprocessed_script):
    #     code, _ = generate_code(selected, p)
    #     write.append(code)
    #     in_file_with_suffix.append(".py")
    # if needs_yaml(unprocessed_script):
    #     yaml_dict = generate_yaml(selected)
    #     write.append(yaml_dict)
    #     in_file_with_suffix.append(".yaml")

    # withTempFiles(
    #     write=write,
    #     in_file_with_suffix=in_file_with_suffix,
    #     then_do=write_bash,
    #     auto_delete=False,
    # )



    # def write_bash(filepaths_for_bash):
    #     def execute_bash(temp_filepaths):
    #         terminal_write_fn(f"\x15bash {temp_filepaths[0]}\n")

    #     script = generate_script(p, selected, filepaths_for_bash)
    #     withTempFiles(
    #         write=[script],
    #         in_file_with_suffix=[".sh"],
    #         then_do=execute_bash,
    #         auto_delete=False,
    #     )



def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(x):
    return {"python": "python", "bash": "bash"}[x]


def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = f"{folder_path}/{filename}{extension}"
    return os.path.relpath(output).replace(os.sep, "/")

def codeCallStr(folder_path, section):
    codePath = codePathStr(folder_path, section["name"], section["codeLanguage"])
    return f"{languageToCall(section['codeLanguage'])} {codePath}\n"



import os
from datetime import datetime



def topological_sort(objects):
    graph = {obj['id']: obj['refs'] for obj in objects}
    visiting, visited = set(), set()
    order = []

    def dfs(node):
        if node in visiting:
            raise ValueError("Circular reference detected")
        if node not in visited:
            visiting.add(node)
            for neighbour in graph[node]:
                dfs(neighbour)
            visiting.remove(node)
            visited.add(node)
            order.append(node)

    for obj in objects:
        if obj['id'] not in visited:
            dfs(obj['id'])

    return order[::-1]






def create_timestamped_folder(base_dir, prefix=''):
    # Ensure the base directory exists, if not, create it
    if not os.path.exists(base_dir):
        try:
            os.makedirs(base_dir)
        except FileExistsError:
            pass  # Directory already created by another thread

    # Format the current timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    # Create folder name with optional prefix
    folder_name = f"{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = os.path.join(base_dir, folder_name)

    # Attempt to create the timestamped folder
    try:
        os.makedirs(folder_path)
    except FileExistsError:
        pass  # Folder already created by another thread

    return folder_path


def write_string_to_file(folder, filename, content):
    # Full path to the file
    file_path = os.path.join(folder, filename)
    # Write the content to the file
    with open(file_path, 'w') as file:
        file.write(content)
    return file_path