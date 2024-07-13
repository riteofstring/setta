import asyncio
import json
import re

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


def extract_default_parameters(signature_help):
    # Extract the first signature's label containing the method signature
    signature_str = signature_help["result"]["signatures"][0]["label"]

    # Updated regex to accurately parse parameter names and default values
    param_pattern = r"(\w+)(?:\s*:\s*[\w\[\]]+)?(?:\s*=\s*([^,)]+))?(?:,|\))"

    # Find all matches in the signature string
    matches = re.findall(param_pattern, signature_str)

    # Create a dictionary of parameter names and their default values
    default_params = {}
    for param, value in matches:
        if value:
            # Strip whitespace from the default value
            default_params[param] = value.strip()
        else:
            # If no default value is specified, set it to None
            default_params[param] = None

    return default_params


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
        if id:
            method = method if method else self.msg_id_to_method[id]
            if method == "textDocument/completion":
                content = [
                    {"label": x["label"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                ]
                await self.websocket_manager.send_message_to_requester(id, content)
            elif method == "textDocument/signatureHelp":
                defaultVals = extract_default_parameters(response)
                content = [
                    {
                        "name": x["label"],
                        "description": x["documentation"]["value"],
                        "defaultVal": defaultVals.get(x["label"], ""),
                    }
                    for x in response["result"]["signatures"][0]["parameters"]
                ]
                await self.websocket_manager.send_message_to_requester(id, content)
        elif method == "textDocument/publishDiagnostics":
            params = response["params"]
            diagnostics = params["diagnostics"]
            uri = params["uri"]
            version = params["version"]
            code = self.versions[uri][version]
            print(code)
            # for d in diagnostics:
            # print(d["message"])

        # print(self.received_messages.keys())
        # process_response(response)
