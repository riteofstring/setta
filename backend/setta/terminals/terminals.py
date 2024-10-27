import asyncio
import copy
import json
import os
import platform
import time
from asyncio import CancelledError
from collections import defaultdict, deque
from datetime import datetime

import psutil
from fastapi import WebSocketDisconnect

from setta.code_gen.export_selected import (
    export_selected,
    get_section_code,
    get_section_type,
    get_selected_section_variant,
)
from setta.code_gen.find_placeholders import (
    double_braces,
    needs_generated_python,
    needs_python_argparse,
    needs_yaml,
)
from setta.code_gen.python.generate_argparse import generate_argparse
from setta.code_gen.python.generate_code import generate_code, replace_keywords
from setta.code_gen.utils import process_refs
from setta.utils.constants import (
    CODE_FOLDER,
    CODE_FOLDER_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
)

if platform.system() == "Windows":
    from winpty import PtyProcess

    from .utils import windows_has_child_processes as has_child_processes

    TERMINAL_NAME = "bash.exe"
else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

    from .utils import linux_has_child_processes as has_child_processes

    TERMINAL_NAME = ["zsh"]


def is_command_running_in_pty(pid):
    try:
        return has_child_processes(pid)
    except psutil.NoSuchProcess:
        return False


class TerminalWebsockets:
    def __init__(self):
        self.sockets = defaultdict(list)
        self.PTY_PIDS = {}
        self.loop = asyncio.get_event_loop()

    async def connect(self, websocket, projectConfigId, id):
        await websocket.accept()
        self.sockets[id].append(websocket)
        if id not in self.PTY_PIDS:
            pty_process = PtyProcess.spawn(TERMINAL_NAME)
            self.PTY_PIDS[id] = {
                "pid": pty_process.pid,
                "start": time.time(),
                "projectConfigId": projectConfigId,
                "process": pty_process,
                "history": deque(maxlen=1000),
                "wasJustResized": False,
            }
        else:
            await websocket.send_text("".join(self.PTY_PIDS[id]["history"]))

    def disconnect(self, websocket, id):
        self.sockets[id].remove(websocket)
        if not self.sockets[id]:
            del self.sockets[id]

    def delete_terminals(self, ids):
        for id in ids:
            if id in self.PTY_PIDS:
                self.PTY_PIDS[id]["process"].terminate()
                del self.PTY_PIDS[id]

    def delete_all_terminals(self):
        for t in self.PTY_PIDS.values():
            t["process"].terminate()
        self.PTY_PIDS = {}
        print("DELETED ALL TERMINALS", flush=True)

    # Function to read from the terminal
    async def read_from_terminal(self, id):
        pty_info = self.PTY_PIDS[id]
        pty_process = pty_info["process"]
        history = pty_info["history"]
        try:
            while True:
                output = await self.loop.run_in_executor(None, pty_process.read, 1024)
                if not output:
                    break
                for ws in self.sockets[id]:
                    if not pty_info["wasJustResized"]:
                        history.append(output)
                    pty_info["wasJustResized"] = False
                    await ws.send_text(output)
        except (WebSocketDisconnect, CancelledError):
            pass

    # Function to write to the terminal
    async def write_to_terminal(self, websocket, id):
        pty_info = self.PTY_PIDS[id]
        pty_process = pty_info["process"]
        try:
            while True:
                input_data = await websocket.receive_text()
                try:
                    json_val = json.loads(input_data)
                    if isinstance(json_val, dict):
                        doResize = json_val["messageType"] == "resize"
                        if doResize:
                            pty_process.setwinsize(json_val["rows"], json_val["cols"])
                        elif json_val["messageType"] == C.WS_RUN_CODE:
                            runCode(json_val, terminal_write_fn=pty_process.write)
                            self.set_terminal_start_time(id)
                        pty_info["wasJustResized"] = doResize
                        continue
                except json.decoder.JSONDecodeError:
                    pass
                if input_data is None:
                    break
                # Write received data to the terminal
                pty_process.write(input_data)
                self.set_terminal_start_time(id)
        except (WebSocketDisconnect, CancelledError):
            pass

    def set_terminal_start_time(self, id):
        self.PTY_PIDS[id]["start"] = time.time()

    def get_free_terminal(self, projectConfigId):
        for k, v in self.PTY_PIDS.copy().items():
            if (
                v["projectConfigId"] == projectConfigId
                and not is_command_running_in_pty(v["pid"])
                and time.time() - v["start"] > 1
            ):
                return k
        return None


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    exporter_obj = export_selected(p, always_export_args_objs=False)
    selected = exporter_obj.output
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code_sections = {
        id: copy.deepcopy(s)
        for id, s in p["sections"].items()
        if get_section_type(p, s["id"]) == C.CODE
    }
    dependencies = {}
    for s in code_sections.values():
        section_variant = get_selected_section_variant(p, s["id"])
        curr_code = section_variant["code"]
        curr_dependencies = []
        replacements = {}
        for other_s in code_sections.values():
            if double_braces(other_s["name"]) in curr_code:
                replacements[other_s["name"]] = codePathStr(
                    folder_path, other_s["name"], other_s["codeLanguage"]
                )
                curr_dependencies.append(other_s["id"])
        if needs_python_argparse(curr_code):
            replacements["SETTA_PYTHON_ARGPARSE"] = generate_argparse(selected)
        if needs_yaml(curr_code):
            replacements["SETTA_YAML_FILE"] = codePathStr(
                folder_path, "SETTA_YAML", "yaml"
            )
        if needs_generated_python(curr_code):
            replacements[C.SETTA_GENERATED_PYTHON] = generate_code(
                selected,
                curr_code,
                replace_templated_code=False,
            )[0]
            curr_code, _ = process_refs(
                curr_code,
                p["codeEVRefs"][s["id"]],
                exporter_obj.get_ref_var_name,
            )

        section_variant["code"] = replace_keywords(curr_code, replacements)
        dependencies[s["id"]] = curr_dependencies

    to_write = topological_sort(dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_section = code_sections[sid]
        code = get_section_code(p, sid)
        extension = languageToExtension(curr_section["codeLanguage"])
        filepath = write_string_to_file(
            folder_path, f"{curr_section['name']}{extension}", code
        )
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        id_to_filepath[sid] = filepath

    # Only run code that isn't referenced by other code
    run_order = [x for x in to_write if all(x not in y for y in dependencies.values())]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        bash_script = ""
        for sid in run_order:
            curr_section = code_sections[sid]
            bash_script += codeCallStr(folder_path, curr_section)
        filepath = write_string_to_file(folder_path, "SETTA_ENTRY.sh", bash_script)
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        command = f"bash {filepath}"
    else:
        sid = run_order[0]
        filepath = id_to_filepath[sid]
        callingProgram = languageToCall(code_sections[sid]["codeLanguage"])
        command = f"{callingProgram} {filepath}"

    env_variable_str = create_env_variable_str(folder_path, p["projectConfig"]["name"])
    command = f"{env_variable_str}{command}"

    if terminal_write_fn:
        terminal_write_fn(f"\x15{command}\n")
    elif command_callback:
        command_callback(command)


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


def topological_sort(objects):
    graph = {id: refs for id, refs in objects.items()}
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

    for id in objects.keys():
        if id not in visited:
            dfs(id)

    return order[::-1]


def create_timestamped_folder(base_dir, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = os.path.join(base_dir, folder_name)

    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
        except FileExistsError:
            pass

    return folder_path


def write_string_to_file(folder, filename, content):
    # Full path to the file
    file_path = os.path.join(folder, filename)
    # Write the content to the file
    with open(file_path, "w") as file:
        file.write(content)
    return file_path


def create_env_variable_str(folder_path, project_config_name):
    location = f"/{project_config_name}"
    return f"{CODE_FOLDER_ENV_VARIABLE}={folder_path} {SEND_ARTIFACT_TO_ENV_VARIABLE}={location} "
