import asyncio
import json
import re
from pprint import pprint

from setta.code_gen.python.position_line_col import line_col_to_position_batch
from setta.lsp.reader_fns.completion import process_completion_result
from setta.lsp.reader_fns.references import process_references_result
from setta.lsp.reader_fns.signatureHelp import process_signature_help_result
from setta.utils.constants import C

from .server import LanguageServerInteractor


def process_diagnostics(diagnostics, code_split, codeJson):
    output = {}
    for d in diagnostics:
        r = d["range"]
        start, end = r["start"], r["end"]
        if "code" not in d:
            continue
        if d["code"] == "reportArgumentType":
            problem_var = code_split[start["line"]][
                start["character"] : end["character"]
            ].strip()
            if codeJson:
                set_message(codeJson, problem_var, output, d["message"])
        elif d["code"] == "reportCallIssue":
            if "missing" not in d["message"]:
                continue
            missing_params = extract_parameters(d["message"])
            # get variable to the left of the equal sign
            assigned_to = code_split[start["line"]].split("=")[0].strip()
            unusedParams = codeJson[assigned_to]["value"]["unusedParams"]
            for potential_problem_var in unusedParams:
                if codeJson[potential_problem_var]["name"] in missing_params:
                    set_message(codeJson, potential_problem_var, output, d["message"])
    return output


def set_message(code_json, problem_var, output, message):
    print("set_message", problem_var)
    section_id, param_info_id = (
        code_json[problem_var]["sectionId"],
        code_json[problem_var]["paramInfoId"],
    )

    if section_id not in output:
        output[section_id] = {}
    if param_info_id not in output[section_id]:
        output[section_id][param_info_id] = []

    output[section_id][param_info_id].append(message)


def extract_parameters(error_string):
    pattern = r'"([^"]+)"'
    parameters = re.findall(pattern, error_string)
    return parameters


class LanguageServerReader(LanguageServerInteractor):
    def __init__(self, server, websocket_manager):
        self.server = server
        self.websocket_manager = websocket_manager
        self.stop_event = asyncio.Event()
        self.reader_task = None

    async def start_listener(self):
        self.stop_event.clear()  # Reset the stop event
        self.reader_task = asyncio.create_task(self.read_response())

    async def stop(self):
        self.stop_event.set()
        if self.reader_task:
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass

    async def read_response(self):
        while not self.stop_event.is_set():
            try:
                await self.read_and_process_message()
            except Exception as e:
                print(f"Error reading from language server: {e}", flush=True)
                # Optional: add a small delay to prevent tight loop if there's a persistent error
                await asyncio.sleep(0.1)

    async def read_and_process_message(self):
        headers = b""
        while not self.stop_event.is_set():
            chunk = await self.server.stdout.read(1)
            if not chunk:
                # Server stdout closed/EOF reached
                self.stop_event.set()  # Signal to stop
                return
            headers += chunk
            if headers.endswith(b"\r\n\r\n"):
                break

        if self.stop_event.is_set():
            return

        headers_str = headers.decode("utf-8")
        header_parts = headers_str.split("\r\n")
        content_length = 0
        for header in header_parts:
            if header.startswith("Content-Length:"):
                content_length = int(header.split(":")[1].strip())
                break

        response = b""
        while len(response) < content_length and not self.stop_event.is_set():
            chunk = await self.server.stdout.read(content_length - len(response))
            if not chunk:
                # Server stdout closed/EOF reached
                self.stop_event.set()  # Signal to stop
                return
            response += chunk

        if self.stop_event.is_set():
            return

        try:
            response = json.loads(response.decode("utf-8"))
            await self.process_response(response)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON response: {e}", flush=True)
            return
        except Exception as e:
            print(f"Error processing response: {e}", flush=True)
            return

    async def process_response(self, response):
        # from pprint import pprint

        # pprint(response)
        id = response.get("id", None)
        method = response.get("method", None)
        if id:
            metadata = self.msg_id_to_metadata.pop(id, {})
            if (
                not self.server.is_initialized
                and id == self.server.initialization_request_id
            ):
                self.server.is_initialized = True
                await self.websocket_manager.broadcast(
                    {"messageType": C.WS_LSP_STATUS, "content": "Initialized"}
                )

            method = method if method else metadata["method"]
            if method == "textDocument/completion":
                content = process_completion_result(
                    response, metadata, self.get_version
                )
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/signatureHelp":
                content = process_signature_help_result(response)
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/references":
                content, return_id = process_references_result(
                    response, metadata, self.get_version
                )
                if id in self.pending_requests:
                    self.pending_requests[id].set_result(content)
                else:
                    await self.websocket_manager.send_message_to_requester(
                        return_id, content
                    )
            elif method == "textDocument/documentHighlight":
                content = []
                # if it's not None, then it's a variable or import or something like that
                if response["result"]:
                    # the response doesn't include uri for some reason,
                    # so we keep track of it manually
                    uri = metadata["uri"]
                    code = self.get_version(uri)["code"]

                    for x in response["result"]:
                        r = x["range"]
                        positions = line_col_to_position_batch(
                            code,
                            [
                                (r["start"]["line"], r["start"]["character"]),
                                (r["end"]["line"], r["end"]["character"]),
                            ],
                        )
                        content.append(
                            {"startPos": positions[0], "endPos": positions[1]}
                        )
                return_id = metadata["return_id"]
                num_messages = metadata["num_messages"]
                await self.websocket_manager.send_message_to_requester(
                    return_id, {"positions": content, "numMessages": num_messages}
                )
            elif method == "textDocument/definition":
                is_valid = bool(response["result"])
                if id in self.pending_requests:
                    self.pending_requests[id].set_result(is_valid)
                else:
                    await self.websocket_manager.send_message_to_requester(id, is_valid)
        elif method == "textDocument/publishDiagnostics":
            # print(response, flush=True)
            params = response["params"]
            diagnostics = params["diagnostics"]
            uri = params["uri"]
            version_info = self.get_version(uri, params.get("version"))
            # TODO, remove this condition
            if version_info["is_gen_code"]:
                code = version_info["code"]
                codeJson = version_info["codeJson"]
                code_split = code.split("\n")
                content = process_diagnostics(diagnostics, code_split, codeJson)
                # print("content", content, flush=True)
                await self.websocket_manager.broadcast(
                    {"messageType": C.WS_LSP_DIAGNOSTICS, "content": content}
                )
