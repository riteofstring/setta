import asyncio
import json
import re
from pprint import pprint

import docstring_parser

from .server import LanguageServerInteractor

type_mapping = {
    1: "text",
    2: "method",
    3: "function",
    4: "constructor",
    5: "field",
    6: "variable",
    7: "class",
    8: "interface",
    9: "module",
    10: "property",
    11: "unit",
    12: "value",
    13: "enum",
    14: "keyword",
    15: "snippet",
    16: "color",
    17: "file",
    18: "reference",
    19: "folder",
    20: "enummember",
    21: "constant",
    22: "struct",
    23: "event",
    24: "operator",
    25: "typeparameter",
}


def extract_variable_name(code_string):
    # Find potential variable names
    potential_names = re.findall(r"\b[a-zA-Z_]\w*\b", code_string)

    # Return the first valid identifier
    return next((name for name in potential_names if name.isidentifier()), None)


def process_docstring(signature):
    if "documentation" in signature:
        parsed = docstring_parser.parse(signature["documentation"]["value"])
        return {
            extract_variable_name(v.arg_name): {
                "default": v.default,
                "description": v.description,
            }
            for v in parsed.params
        }
    return {}


def wrapper_parse_signature(signature, docstring, get_proposed_params):
    params = get_proposed_params(signature, docstring)
    param_info_list = []
    positional_only_indicator_idx = -1

    for idx, (name, default, description) in enumerate(params):
        if name == "/":
            positional_only_indicator_idx = idx
            continue
        if name in [None, "", "*", "..."]:
            continue

        if not default:
            default = ""

        if not description:
            description = docstring.get(name, {}).get("description", "")

        # Append parsed information to list
        param_info_list.append(
            {
                "name": name,
                "defaultVal": default,
                "description": description,
                "positionalOnly": False,
            }
        )

    for idx in range(0, positional_only_indicator_idx):
        param_info_list[idx]["positionalOnly"] = True

    return param_info_list


def get_docstring_parser_param_proposals(_, docstring):
    return [(k, v["default"], v["description"]) for k, v in docstring.items()]


def get_pyright_param_proposals(signature, _):
    parameters = signature["parameters"]
    params = [(p["label"], p["documentation"]["value"]) for p in parameters]
    if len(params) == 0:
        params = signature["label"].split(",")

    proposals = []
    for param, description in params:
        # Extract parameter name and default value
        parts = param.split("=")
        name = extract_variable_name(parts[0].strip())
        default = parts[1].strip() if len(parts) > 1 else None
        proposals.append((name, default, description))

    return proposals


def parse_signature(signature):
    docstring = process_docstring(signature)
    param_info_list = wrapper_parse_signature(
        signature, docstring, get_pyright_param_proposals
    )
    if len(param_info_list) == 0:
        param_info_list = wrapper_parse_signature(
            signature, docstring, get_docstring_parser_param_proposals
        )
    return param_info_list


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
            ]
            if codeJson:
                set_message(codeJson, problem_var, output, d["message"])
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


class LanguageServerReader(LanguageServerInteractor):
    def __init__(self, server, websocket_manager):
        self.server = server
        self.websocket_manager = websocket_manager
        self.stop_event = asyncio.Event()

    async def start_listener(self):
        loop = asyncio.get_running_loop()
        loop.create_task(self.read_response())

    async def read_response(self):
        while not self.stop_event.is_set():
            headers = b""
            while not self.stop_event.is_set():
                chunk = await self.server.stdout.read(1)
                if not chunk:
                    break
                headers += chunk
                if headers.endswith(b"\r\n\r\n"):
                    break

            if self.stop_event.is_set():
                break

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
                    break
                response += chunk

            if self.stop_event.is_set():
                break

            try:
                response = json.loads(response.decode("utf-8"))
                await self.process_response(response)
            except json.JSONDecodeError as e:
                print(f"JSONDecodeError: {e} - Response: {response}")
                break

    async def process_response(self, response):
        id = response.get("id", None)
        method = response.get("method", None)
        pprint(response)
        if id:
            method = method if method else self.msg_id_to_method[id]
            if method == "textDocument/completion":
                content = [
                    {"label": x["label"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                    if x["label"] not in self.msg_id_to_generated_var_names[id]
                ]
                referencable_var_names = [
                    {"label": x, "type": "variable"}
                    for x in self.msg_id_to_referencable_var_names[id]
                ]
                content = [*referencable_var_names, *content]
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/signatureHelp":
                if (response["result"]):
                    content = parse_signature(response["result"]["signatures"][0])
                    # pprint(content)
                else:
                    content = None
                await self.websocket_manager.send_message_to_requester(id, content)
        elif method == "textDocument/publishDiagnostics":
            # print(response)
            params = response["params"]
            diagnostics = params["diagnostics"]
            uri = params["uri"]
            version_info = self.get_version(uri, params.get("version"))
            code = version_info["code"]
            codeJson = version_info["codeJson"]
            code_split = code.split("\n")
            content = process_diagnostics(diagnostics, code_split, codeJson)
            # print("content", content, flush=True)
            await self.websocket_manager.broadcast(
                {"messageType": "diagnostics", "content": content}
            )

        # print(self.received_messages.keys())
        # process_response(response)
