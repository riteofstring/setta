import asyncio
import errno
import json
import logging
import platform
import select
import shlex
import time
from asyncio import CancelledError
from collections import defaultdict, deque
from typing import Any, Callable

import psutil
from fastapi import WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK

from setta.database.settings_file import SettingsFile
from setta.logging.tasks import spawn_background_task
from setta.terminals.utils import linux_get_child_process_details
from setta.types.id import ID
from setta.utils.constants import C
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

logger = logging.getLogger(__name__)


SETTA_CLEAR_CMD = "SETTA_CLEAR_CMD"
TERMINAL_ID_SEPARATOR = "::"
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


def build_terminal_id(section_id: ID, share_session_id: str | None) -> str:
    if share_session_id is None:
        return str(section_id)
    return f"{share_session_id}{TERMINAL_ID_SEPARATOR}{section_id}"


class Terminals:
    def __init__(
        self, websocket_msg_handler: WMHFrontendSender, settings_file: SettingsFile
    ):
        self.section_to_socket_ids = defaultdict(set)
        self.sockets = {}
        self.PTY_PIDS = {}
        self.websocket_msg_handler = websocket_msg_handler
        self.settings_file = settings_file
        # asyncio.create_task(self.monitor_child_processes())

    def new_terminal(
        self, projectConfigId, sectionId, share_session_id: str | None = None
    ):
        if sectionId not in self.PTY_PIDS:
            terminal_shell = get_terminal_shell(
                self.settings_file.settings.backend.defaultTerminalShell
            )
            pty_process = PtyProcess.spawn(terminal_shell)
            self.PTY_PIDS[sectionId] = {
                "pid": pty_process.pid,
                "start": time.time(),
                "projectConfigId": projectConfigId,
                "shareSessionId": share_session_id,
                "process": pty_process,
                "history": deque(maxlen=1000),
                "wasJustResized": False,
                "terminalPromptIsReady": asyncio.Event(),
            }
            pty_info = self.PTY_PIDS[sectionId]
            if (
                IS_WINDOWS
                or not self.settings_file.settings.backend.clearTerminalBeforeMarkingAsReady
            ):
                pty_info["terminalPromptIsReady"].set()

            logger.debug("created new pty_process %s", sectionId)
            if not pty_info["terminalPromptIsReady"].is_set():
                pty_process.write(
                    f"alias {SETTA_CLEAR_CMD}='clear'\n{SETTA_CLEAR_CMD}\n"
                )
            spawn_background_task(
                self.start_reading_from_terminal(sectionId),
                label="terminal-reader",
                context=self._terminal_logging_context(sectionId),
                **self._terminal_context_kwargs(sectionId),
            )
            return True
        return False

    async def connect(self, websocket: WebSocket, sectionId: str, id: str) -> bool:
        try:
            await websocket.accept()
        except RuntimeError:
            return False
        # Keep a stable reference for this connection's registration.
        # Other tasks (e.g. PTY output broadcasts) can call disconnect() while we're
        # awaiting below, which may remove/replace self.sockets[id]. Re-indexing
        # self.sockets[id] after an await can therefore raise KeyError or (worse)
        # operate on a different connection that reused the same id.
        socket_info = {"ws": websocket, "sentReadyMsg": False}
        self.sockets[id] = socket_info
        self.section_to_socket_ids[sectionId].add(id)
        try:
            await self.PTY_PIDS[sectionId]["terminalPromptIsReady"].wait()
            # If this id has been disconnected/unregistered (or replaced), abort
            # this connect attempt. Even if websocket.send_text() might still
            # succeed, we should not proceed if broadcasts will no longer target
            # this connection.
            if self.sockets.get(id) is not socket_info:
                self.disconnect(sectionId, id)
                return False
            if not socket_info["sentReadyMsg"]:
                await websocket.send_text(C.SETTA_TERMINAL_READY)
                socket_info["sentReadyMsg"] = True
            await websocket.send_text(self.get_terminal_history(sectionId))
        except (WebSocketDisconnect, ConnectionClosedOK, RuntimeError):
            self.disconnect(sectionId, id)
            return False
        return True

    def disconnect(self, sectionId: str, id: str) -> None:
        logger.debug("disconnecting %s", id)
        try:
            del self.sockets[id]
        except KeyError:
            pass
        self.section_to_socket_ids[sectionId].discard(id)

    async def delete_terminal(self, sectionId):
        logger.debug("delete terminal %s", sectionId)
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
                    # We wait for the SETTA_CLEAR_CMD string to appear at least once
                    # before we consider the terminal ready.
                    # This is just to make the terminal look less cluttered and annoying on the frontend.
                    if initial_buffer.count(SETTA_CLEAR_CMD) >= 1:
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

    # Function to write to the terminal
    async def write_to_terminal(
        self,
        websocket,
        sectionId,
        *,
        allow_input: bool = True,
        on_activity: Callable[[], None] | None = None,
    ):
        pty_info = self.PTY_PIDS[sectionId]
        pty_process = pty_info["process"]
        while True:
            try:
                input_data = await websocket.receive_text()
                if on_activity is not None:
                    on_activity()
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
                if allow_input and input_data:
                    pty_process.write(input_data)
                    self.set_terminal_start_time(sectionId)
            except (WebSocketDisconnect, CancelledError, ConnectionClosedOK):
                break
            except EOFError:
                break
            except OSError as e:
                if e.errno == errno.EIO:  # Input/output error
                    break

    def set_terminal_start_time(self, id):
        self.PTY_PIDS[id]["start"] = time.time()

    def get_free_terminal(self, projectConfigId, share_session_id: str | None = None):
        for k, v in self.PTY_PIDS.items():
            if (
                v["projectConfigId"] == projectConfigId
                and v.get("shareSessionId") == share_session_id
                and not has_child_processes(v["pid"])
                and time.time() - v["start"] > 1
            ):
                return k
        return None

    def get_existing_terminals(
        self, projectConfigId, share_session_id: str | None = None
    ):
        output: list[str] = []
        for k, v in self.PTY_PIDS.items():
            if (
                v["projectConfigId"] == projectConfigId
                and v.get("shareSessionId") == share_session_id
            ):
                output.append(k)
        return output

    def get_terminals_for_share_session(self, share_session_id: str) -> list[str]:
        output: list[str] = []
        for terminal_id, info in self.PTY_PIDS.items():
            if info.get("shareSessionId") == share_session_id:
                output.append(terminal_id)
        return output

    async def delete_terminals_for_share_session(self, share_session_id: str) -> None:
        terminal_ids = self.get_terminals_for_share_session(share_session_id)
        if not terminal_ids:
            return
        await self.delete_terminals(terminal_ids)

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

    async def send_output_to_sectionId(
        self, sectionId: str, output: str, setSentReadyMsg: bool = False
    ) -> None:
        for wsId in list(self.section_to_socket_ids[sectionId]):
            socket_info = self.sockets.get(wsId)
            if socket_info is None:
                self.section_to_socket_ids[sectionId].discard(wsId)
                continue
            ws = socket_info["ws"]
            try:
                await ws.send_text(output)
            except (WebSocketDisconnect, ConnectionClosedOK, RuntimeError):
                self.disconnect(sectionId, wsId)
                continue
            if setSentReadyMsg:
                socket_info["sentReadyMsg"] = True

    async def start_reading_from_terminal(self, terminalId):
        try:
            await self.read_from_terminal(terminalId)
        finally:
            await self.delete_terminal(terminalId)

    def _terminal_context_kwargs(self, section_id: str) -> dict[str, Any]:
        info = self.PTY_PIDS.get(section_id, {})
        project_config_id = info.get("projectConfigId")
        share_session_id = info.get("shareSessionId")
        normalized_project_id = (
            str(project_config_id) if project_config_id is not None else None
        )
        extra_values = {"section_id": str(section_id)}
        if share_session_id is not None:
            extra_values["share_session_id"] = share_session_id
        kwargs: dict[str, Any] = {
            "project_config_id": normalized_project_id,
            "extra_values": extra_values,
        }
        return kwargs

    def _terminal_logging_context(self, section_id: str) -> dict[str, str]:
        info = self.PTY_PIDS.get(section_id, {})
        context = {"terminal_section_id": str(section_id)}
        project_config_id = info.get("projectConfigId")
        if project_config_id is not None:
            context["terminal_project_id"] = str(project_config_id)
        share_session_id = info.get("shareSessionId")
        if share_session_id is not None:
            context["terminal_share_session_id"] = share_session_id
        return context

    async def monitor_child_processes(self):
        """Periodically check and broadcast child process details for all terminals"""
        CHECK_INTERVAL = 2.0  # seconds between checks
        while True:
            terminal_metadata = []
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

            await self.websocket_msg_handler.broadcast_terminal_metadata(
                terminal_metadata
            )
            # Sleep until next check
            await asyncio.sleep(CHECK_INTERVAL)

    def get_terminal_history(self, terminalId):
        return "".join(self.PTY_PIDS[terminalId]["history"])
