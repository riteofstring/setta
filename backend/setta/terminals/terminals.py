import asyncio
import errno
import json
import logging
import platform
import select
import shlex
import time
import traceback
from asyncio import CancelledError
from collections import defaultdict, deque

import psutil
from fastapi import WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK

from setta.database.settings_file import SettingsFile
from setta.terminals.utils import linux_get_child_process_details
from setta.utils.constants import C
from setta.websockets.msg_handlers.terminals import WMHTerminals
from setta.websockets.websocket_manager import WebsocketManager

logger = logging.getLogger(__name__)


SETTA_CLEAR_CMD = "SETTA_CLEAR_CMD"
IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"


if IS_WINDOWS:
    from winpty import PtyProcess  # type: ignore

    from .utils import windows_has_child_processes as has_child_processes

else:
    from ptyprocess import PtyProcessUnicode as PtyProcess

    from .utils import linux_has_child_processes as has_child_processes


def get_terminal_shell(defaultTerminalShell: str | None):
    if defaultTerminalShell:
        return shlex.split(defaultTerminalShell, posix=not IS_WINDOWS)
    if IS_WINDOWS:
        return ["bash.exe"]
    if IS_MACOS:
        return ["zsh"]
    return ["bash"]


class Terminals:
    def __init__(
        self, websocket_manager: WebsocketManager, settings_file: SettingsFile
    ):
        self.section_to_socket_ids = defaultdict(set)
        self.sockets = {}
        self.PTY_PIDS = {}
        self.websocket_msg_handler = WMHTerminals(websocket_manager)
        self.settings_file = settings_file
        # asyncio.create_task(self.monitor_child_processes())

    def new_terminal(self, projectConfigId, sectionId, isTemporary):
        if sectionId not in self.PTY_PIDS:
            terminal_shell = get_terminal_shell(
                self.settings_file.settings.backend.defaultTerminalShell
            )
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
                or not self.settings_file.settings.backend.clearTerminalBeforeMarkingAsReady
            ):
                pty_info["terminalPromptIsReady"].set()

            logger.debug(f"created new pty_process {sectionId}")
            if not pty_info["terminalPromptIsReady"].is_set():
                pty_process.write(
                    f"alias {SETTA_CLEAR_CMD}='clear'\n{SETTA_CLEAR_CMD}\n"
                )
            asyncio.create_task(self.start_reading_from_terminal(sectionId))
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
        await websocket.send_text(self.get_terminal_history(sectionId))

    def disconnect(self, sectionId, id):
        logger.debug(f"disconnecting {id}")
        try:
            del self.sockets[id]
        except KeyError:
            pass
        self.section_to_socket_ids[sectionId].discard(id)

    async def delete_terminal(self, sectionId):
        logger.debug(f"delete terminal {sectionId}")
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
            except (WebSocketDisconnect, CancelledError, ConnectionClosedOK):
                break
            except EOFError:
                break
            except OSError as e:
                if e.errno == errno.EIO:  # Input/output error
                    break
            except Exception as e:
                logger.debug(f"Exception details:\n{traceback.format_exc()}")
                logger.debug(e)
                logger.debug("read_from_terminal caught the exception!")

    # Function to write to the terminal
    async def write_to_terminal(self, websocket, sectionId):
        pty_info = self.PTY_PIDS[sectionId]
        pty_process = pty_info["process"]
        while True:
            try:
                input_data = await websocket.receive_text()
                try:
                    json_val = json.loads(input_data)
                except json.decoder.JSONDecodeError:
                    json_val = None
                if isinstance(json_val, dict):
                    doResize = json_val["messageType"] == C.WS_TERMINAL_RESIZE
                    if doResize:
                        pty_process.setwinsize(json_val["rows"], json_val["cols"])
                    pty_info["wasJustResized"] = doResize
                    continue
                elif input_data:
                    pty_process.write(input_data)
                    self.set_terminal_start_time(sectionId)
            except (WebSocketDisconnect, CancelledError, ConnectionClosedOK):
                break
            except EOFError:
                break
            except OSError as e:
                if e.errno == errno.EIO:  # Input/output error
                    break
            except Exception as e:
                logger.debug(f"Exception details:\n{traceback.format_exc()}")
                logger.debug(e)
                logger.debug("write_to_terminal caught the exception!")

    def set_terminal_start_time(self, id):
        self.PTY_PIDS[id]["start"] = time.time()

    def get_free_terminal(self, projectConfigId):
        for k, v in self.PTY_PIDS.items():
            if (
                v["projectConfigId"] == projectConfigId
                and not has_child_processes(v["pid"])
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

    async def run_command_in_terminal(self, terminal_id, command):
        info = self.PTY_PIDS[terminal_id]
        await info["terminalPromptIsReady"].wait()
        info["process"].write(f"\x15{command}\n")
        self.set_terminal_start_time(terminal_id)

    def kill_processes(self, ids):
        num_killed = 0
        for id in ids:
            info = self.PTY_PIDS[id]
            if has_child_processes(info["pid"]):
                info["process"].sendintr()
                num_killed += 1
        return num_killed

    async def send_output_to_sectionId(self, sectionId, output, setSentReadyMsg=False):
        for wsId in self.section_to_socket_ids[sectionId]:
            ws = self.sockets[wsId]["ws"]
            try:
                await ws.send_text(output)
                if setSentReadyMsg:
                    self.sockets[wsId]["sentReadyMsg"] = True
            except:
                continue

    async def start_reading_from_terminal(self, terminalId):
        read_task = asyncio.create_task(self.read_from_terminal(terminalId))
        await read_task
        await self.delete_terminal(terminalId)

    async def monitor_child_processes(self):
        """Periodically check and broadcast child process details for all terminals"""
        CHECK_INTERVAL = 2.0  # seconds between checks
        while True:
            terminal_metadata = []
            try:
                for section_id in list(self.PTY_PIDS.keys()):
                    # Only check terminals that have connected clients
                    try:
                        info = self.PTY_PIDS[section_id]

                        # Get child process details
                        children = linux_get_child_process_details(info["pid"])
                        terminal_metadata.append(
                            {
                                "sectionId": section_id,
                                "projectConfigId": info["projectConfigId"],
                                "processes": children,
                            }
                        )

                    except (KeyError, psutil.NoSuchProcess):
                        # Terminal might have been deleted during iteration
                        continue
            except Exception as e:
                logger.error(f"Error monitoring child processes: {e}")
                logger.debug(f"Exception details:\n{traceback.format_exc()}")

            await self.websocket_msg_handler.broadcast_terminal_metadata(
                terminal_metadata
            )
            # Sleep until next check
            await asyncio.sleep(CHECK_INTERVAL)

    def get_terminal_history(self, terminalId):
        return "".join(self.PTY_PIDS[terminalId]["history"])
