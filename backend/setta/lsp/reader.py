import asyncio
import json
import re
from pprint import pprint

import docstring_parser

from setta.code_gen.python.position_line_col import line_col_to_position_batch
from setta.utils.constants import C

from .server import LanguageServerInteractor

type_mapping = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
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
    proposals = []
    for param, description in params:
        # Extract parameter name and default value
        if param.startswith("/"):
            proposals.append((param, None, None))
            continue
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
    documentation = signature.get("documentation", {"value": ""})["value"]
    return [documentation, param_info_list]


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

    async def start_listener(self):
        asyncio.get_running_loop().create_task(self.read_response())

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
                # print(f"JSONDecodeError: {e} - Response: {response}")
                break

    async def process_response(self, response):
        # from pprint import pprint

        # pprint(response)
        id = response.get("id", None)
        method = response.get("method", None)
        if id:
            method = method if method else self.msg_id_to_metadata[id]["method"]
            if method == "textDocument/completion":
                content = [
                    {"label": x["label"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                    if x["label"]
                    not in self.msg_id_to_metadata[id]["generated_var_names"]
                ]
                referencable_var_names = [
                    {"label": x, "type": "variable"}
                    for x in self.msg_id_to_metadata[id]["referencable_var_names"]
                ]
                content = [*referencable_var_names, *content]
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/signatureHelp":
                if response["result"]:
                    content = parse_signature(response["result"]["signatures"][0])
                    # pprint(content)
                else:
                    content = None
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/references":
                print("textDocument/references response", response, flush=True)
                content = []
                if response["result"] and len(response["result"]) > 0:
                    code = self.get_version(response["result"][0]["uri"])["code"]
                    line_cols = []
                    for x in response["result"]:
                        line_cols.append(
                            (
                                x["range"]["start"]["line"],
                                x["range"]["start"]["character"],
                            )
                        )
                        line_cols.append(
                            (x["range"]["end"]["line"], x["range"]["end"]["character"])
                        )
                    positions = line_col_to_position_batch(code, line_cols)
                    position_offset = self.msg_id_to_metadata[id]["position_offset"]
                    for idx in range(0, len(positions), 2):
                        startPos = positions[idx] - position_offset
                        endPos = positions[idx + 1] - position_offset
                        content.append(
                            {
                                "startPos": startPos,
                                "endPos": endPos,
                            }
                        )

                # print(content, flush=True)
                return_id = self.msg_id_to_metadata[id]["return_id"]
                num_messages = self.msg_id_to_metadata[id]["num_messages"]
                # print('returning reference request', content, flush=True)
                await self.websocket_manager.send_message_to_requester(
                    return_id, {"positions": content, "numMessages": num_messages}
                )
            elif method == "textDocument/documentHighlight":
                content = []
                # if it's not None, then it's a variable or import or something like that
                if response["result"]:
                    # the response doesn't include uri for some reason,
                    # so we keep track of it manually
                    uri = self.msg_id_to_metadata[id]["uri"]
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
                return_id = self.msg_id_to_metadata[id]["return_id"]
                num_messages = self.msg_id_to_metadata[id]["num_messages"]
                await self.websocket_manager.send_message_to_requester(
                    return_id, {"positions": content, "numMessages": num_messages}
                )
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

        # print(self.received_messages.keys())
        # process_response(response)
        # pprint(response)
