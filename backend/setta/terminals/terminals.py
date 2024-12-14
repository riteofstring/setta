import asyncio
import copy
import errno
import json
import os
import platform
import select
import time
import traceback
from asyncio import CancelledError
from collections import defaultdict, deque
from datetime import datetime

import psutil
from fastapi import WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK

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
    USER_SETTINGS,
    C,
    add_base_ui_types,
)

SETTA_CLEAR_CMD = "SETTA_CLEAR_CMD"
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"


if IS_WINDOWS:
    from winpty import PtyProcess

    from .utils import windows_has_child_processes as has_child_processes

else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

    from .utils import linux_has_child_processes as has_child_processes


def is_command_running_in_pty(pid):
    try:
        return has_child_processes(pid)
    except psutil.NoSuchProcess:
        return False


def get_terminal_shell():
    if USER_SETTINGS["backend"]["defaultTerminalShell"]:
        return USER_SETTINGS["backend"]["defaultTerminalShell"]
    if IS_WINDOWS:
        return "bash.exe"
    if IS_MACOS:
        return "zsh"
    return "bash"


class TerminalWebsockets:
    def __init__(self):
        self.section_to_socket_ids = defaultdict(set)
        self.sockets = {}
        self.PTY_PIDS = {}

    def new_terminal(self, projectConfigId, sectionId, isTemporary):
        if sectionId not in self.PTY_PIDS:
            terminal_shell = get_terminal_shell()
            if not IS_WINDOWS:
                terminal_shell = [terminal_shell]
            pty_process = PtyProcess.spawn(terminal_shell)
            self.PTY_PIDS[sectionId] = {
                "pid": pty_process.pid,
                "start": time.time(),
                "projectConfigId": projectConfigId,
                "process": pty_process,
                "history": deque(maxlen=1000),
                "wasJustResized": False,
                "terminalPromptIsReady": asyncio.Event(),
                "isTemporary": isTemporary,
            }
            pty_info = self.PTY_PIDS[sectionId]
            if (
                IS_WINDOWS
                or not USER_SETTINGS["backend"]["clearTerminalBeforeMarkingAsReady"]
            ):
                pty_info["terminalPromptIsReady"].set()

            print("created new pty_process", sectionId, flush=True)
            if not pty_info["terminalPromptIsReady"].is_set():
                pty_process.write(
                    f"alias {SETTA_CLEAR_CMD}='clear'\n{SETTA_CLEAR_CMD}\n"
                )
            return True
        return False

    async def connect(self, websocket, sectionId, id):
        await websocket.accept()
        self.sockets[id] = {"ws": websocket, "sentReadyMsg": False}
        self.section_to_socket_ids[sectionId].add(id)
        await self.PTY_PIDS[sectionId]["terminalPromptIsReady"].wait()
        if not self.sockets[id]["sentReadyMsg"]:
            await websocket.send_text(C.SETTA_TERMINAL_READY)
            self.sockets[id]["sentReadyMsg"] = True
        await websocket.send_text("".join(self.PTY_PIDS[sectionId]["history"]))

    def disconnect(self, sectionId, id):
        print("disconnecting", id, flush=True)
        try:
            del self.sockets[id]
        except KeyError:
            pass
        self.section_to_socket_ids[sectionId].discard(id)

    async def delete_terminal(self, sectionId):
        print("delete terminal", sectionId, flush=True)
        if sectionId in self.PTY_PIDS:
            try:
                await asyncio.to_thread(
                    self.PTY_PIDS[sectionId]["process"].terminate, force=True
                )
                del self.PTY_PIDS[sectionId]
            except KeyError:
                pass

        # make copy to avoid set size changing while iterating
        to_disconnect = set(self.section_to_socket_ids[sectionId])
        for id in to_disconnect:
            self.disconnect(sectionId, id)

    async def delete_terminals(self, sectionIds):
        await asyncio.gather(*(self.delete_terminal(s) for s in sectionIds))

    async def delete_all_terminals(self):
        await self.delete_terminals(self.PTY_PIDS.keys())

    # Function to read from the terminal
    async def read_from_terminal(self, sectionId):
        pty_info = self.PTY_PIDS[sectionId]
        pty_process = pty_info["process"]
        history = pty_info["history"]
        initial_buffer = ""
        while True:
            # print("read_from_terminal while loop", flush=True)
            try:
                output, _, _ = await asyncio.get_running_loop().run_in_executor(
                    None,
                    select.select,
                    [pty_process.fd],
                    [],
                    [],
                    None,  # timeout of 0 makes this non-blocking
                )
                if not output:
                    continue
                output = pty_process.read(1024)
                if not pty_info["terminalPromptIsReady"].is_set():
                    initial_buffer += output
                    # We wait for the SETTA_CLEAR_CMD string to appear four times
                    # before we consider the terminal ready.
                    # This is just to make the terminal look less cluttered and annoying on the frontend.
                    if initial_buffer.count(SETTA_CLEAR_CMD) >= 4:
                        pty_info["terminalPromptIsReady"].set()
                        await self.send_output_to_sectionId(
                            sectionId, C.SETTA_TERMINAL_READY, setSentReadyMsg=True
                        )
                    continue
                if not pty_info["wasJustResized"]:
                    history.append(output)
                pty_info["wasJustResized"] = False
                await self.send_output_to_sectionId(sectionId, output)
            except (WebSocketDisconnect, CancelledError, ConnectionClosedOK) as e:
                # print(e, flush=True)
                break
            except EOFError:
                # print(f"Terminal EOF for section {sectionId}", flush=True)
                break
            except OSError as e:
                if e.errno == errno.EIO:  # Input/output error
                    # print(
                    #     f"Terminal I/O error for section {sectionId}: {e}", flush=True
                    # )
                    break
            except Exception as e:
                print(f"Exception details:\n{traceback.format_exc()}")
                print(e, flush=True)
                print("read_from_terminal caught the exception!", flush=True)

    # Function to write to the terminal
    async def write_to_terminal(self, websocket, sectionId):
        pty_info = self.PTY_PIDS[sectionId]
        pty_process = pty_info["process"]
        while True:
            # print("write_to_terminal while loop", flush=True)
            try:
                input_data = await websocket.receive_text()
                print("input_data", input_data, flush=True)
                try:
                    json_val = json.loads(input_data)
                except json.decoder.JSONDecodeError:
                    json_val = None
                if isinstance(json_val, dict):
                    doResize = json_val["messageType"] == C.WS_TERMINAL_RESIZE
                    if doResize:
                        pty_process.setwinsize(json_val["rows"], json_val["cols"])
                    elif json_val["messageType"] == C.WS_RUN_CODE:
                        runCode(json_val, terminal_write_fn=pty_process.write)
                        self.set_terminal_start_time(sectionId)
                    pty_info["wasJustResized"] = doResize
                    continue
                elif input_data:
                    pty_process.write(input_data)
                    self.set_terminal_start_time(sectionId)
            except (WebSocketDisconnect, CancelledError, ConnectionClosedOK) as e:
                # print(e, flush=True)
                break
            except EOFError:
                # print(f"Terminal EOF for section {sectionId}", flush=True)
                break
            except OSError as e:
                if e.errno == errno.EIO:  # Input/output error
                    # print(
                    #     f"Terminal I/O error for section {sectionId}: {e}", flush=True
                    # )
                    break
            except Exception as e:
                print(f"Exception details:\n{traceback.format_exc()}")
                print(e, flush=True)
                print("write_to_terminal caught the exception!", flush=True)

    def set_terminal_start_time(self, id):
        self.PTY_PIDS[id]["start"] = time.time()

    def get_free_terminal(self, projectConfigId):
        for k, v in self.PTY_PIDS.items():
            if (
                v["projectConfigId"] == projectConfigId
                and not is_command_running_in_pty(v["pid"])
                and time.time() - v["start"] > 1
            ):
                return k
        return None

    def get_existing_terminals(self, projectConfigId):
        output = []
        for k, v in self.PTY_PIDS.items():
            if v["projectConfigId"] == projectConfigId:
                output.append({"id": k, "isTemporary": v["isTemporary"]})
        return output

    async def send_output_to_sectionId(self, sectionId, output, setSentReadyMsg=False):
        for wsId in self.section_to_socket_ids[sectionId]:
            ws = self.sockets[wsId]["ws"]
            try:
                await ws.send_text(output)
                if setSentReadyMsg:
                    self.sockets[wsId]["sentReadyMsg"] = True
            except:
                continue


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    add_base_ui_types(p)
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
            curr_code, _ = process_refs(
                curr_code,
                p["codeEVRefs"][s["id"]],
                exporter_obj.get_ref_var_name,
            )
            replacements[C.SETTA_GENERATED_PYTHON] = generate_code(
                selected,
                curr_code,
                replace_templated_code=False,
            )[0]

        section_variant["code"] = replace_keywords(curr_code, replacements)
        dependencies[s["id"]] = curr_dependencies

    to_write = topological_sort(dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_section = code_sections[sid]
        codeLanguage = curr_section["codeLanguage"]
        extension = languageToExtension(codeLanguage)
        code = prepend_with_setup_code(
            get_section_code(p, sid),
            codeLanguage,
            folder_path,
            p["projectConfig"]["name"],
        )
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


def prepend_with_setup_code(code, codeLanguage, folder_path, project_config_name):
    if codeLanguage == "python":
        location = f"/{project_config_name}"
        setup_code = (
            "import sys\n"
            "import os\n"
            "from pathlib import Path\n"
            "sys.path.append(str(Path(__file__).parent.parent.parent))\n"
            f"os.environ['{SEND_ARTIFACT_TO_ENV_VARIABLE}'] = '{location}'\n"
            f"os.environ['{CODE_FOLDER_ENV_VARIABLE}'] = '{folder_path}'\n"
        )
        code = setup_code + code
    return code
