import asyncio
import json
import re
import uuid
from collections import defaultdict
from pathlib import Path
from pprint import pprint

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


def get_file_uri(path):
    return f"file://{path}"


def get_virtual_uri(root_path, code_id):
    return f"file://{root_path / code_id}.py"


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


class LanguageServer:
    def __init__(self, root_path):
        self.root_path = root_path
        self.sent_msg_info = {}
        self.server = None

    async def start_server(self):
        print("starting server")
        self.server = await asyncio.create_subprocess_shell(
            # "pylyzer --server D:\\Documents\\App Development\\runcoder\\.runcoder_code\\test.py",
            "pyright-langserver --stdio",
            # "pylsp",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

    def kill_server(self):
        self.server.terminate()

    @property
    def stdin(self):
        return self.server.stdin

    @property
    def stdout(self):
        return self.server.stdout


class LanguageServerWriter:
    def __init__(self, server):
        self.server = server
        self.versions = defaultdict(int)

    async def send_request(self, method, params, id=None):
        request_dict = {"jsonrpc": "2.0", "method": method, "params": params}
        if id:
            request_dict["id"] = id
            self.sent_msg_info[id] = request_dict
        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        init_params = {
            "capabilities": {},
            "workspaceFolders": [{"uri": get_file_uri(self.root_path)}],
        }
        await self.send_request("initialize", init_params, id=str(uuid.uuid4()))

    async def send_document_open_request(self, code, code_id):
        open_params = {
            "textDocument": {
                "uri": get_virtual_uri(self.root_path, code_id),
                "languageId": "python",
                "version": self.get_version_number(code_id),
                "text": code,
            }
        }
        await self.send_request("textDocument/didOpen", open_params)

    async def send_autocomplete_request(self, line, character, code_id, request_id):
        completion_params = {
            "textDocument": {"uri": get_virtual_uri(self.root_path, code_id)},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/completion", completion_params, id=request_id
        )
        print("done send_autocomplete_request", flush=True)

    async def send_signature_help_request(self, line, character, code_id, request_id):
        completion_params = {
            "textDocument": {"uri": get_virtual_uri(self.root_path, code_id)},
            "position": {"line": line, "character": character},
            "context": {"triggerKind": 2, "triggerCharacter": "("},
        }
        print("line, character", line, character, flush=True)
        await self.send_request(
            "textDocument/signatureHelp", completion_params, id=request_id
        )

    async def send_didChangeConfiguration(self):
        await self.send_request("workspace/didChangeConfiguration", {})

    async def send_document_update(self, code, code_id):
        params = {
            "textDocument": {
                "uri": get_virtual_uri(self.root_path, code_id),
                "version": self.get_version_number(code_id),
            },
            "contentChanges": [{"text": code}],
        }
        await self.send_request("textDocument/didChange", params)
        print("done send_document_update", flush=True)

    @property
    def root_path(self):
        return self.server.root_path

    @property
    def sent_msg_info(self):
        return self.server.sent_msg_info

    def get_version_number(self, virtual_filename):
        self.versions[virtual_filename] += 1
        return self.versions[virtual_filename]


class LanguageServerListener:
    def __init__(self, server, websocket_manager):
        self.server = server
        self.websocket_manager = websocket_manager
        self.stop_event = asyncio.Event()
        self.received_first_response_with_id = False

    async def start_listener(self):
        loop = asyncio.get_running_loop()
        loop.create_task(self.read_response())
        print("listening")

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
        pprint(response)
        if id:
            method = self.sent_msg_info[id]["method"]
            if method == "textDocument/completion":
                content = [
                    {"label": x["label"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                ]
                # await self.websocket_manager.send_message_to_requester(id, content)
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
                # await self.websocket_manager.send_message_to_requester(id, content)

        # print(self.received_messages.keys())
        # process_response(response)

    @property
    def sent_msg_info(self):
        return self.server.sent_msg_info


async def main():
    lsp = LanguageServer(
        root_path=Path("D:/Documents/App Development/runcoder/.runcoder_code")
    )
    lsp_writer = LanguageServerWriter(lsp)
    lsp_listener = LanguageServerListener(lsp, None)

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()
    await lsp_writer.send_didChangeConfiguration()
    await lsp_writer.send_document_open_request("import torch\ntorch.nn.C", "test")
    await lsp_writer.send_autocomplete_request(1, 10, "test", "1234")
    # await lsp_writer.send_hover_request(1, 2, "test", str(uuid.uuid4()))
    # await lsp_writer.send_symbol_request("test", str(uuid.uuid4()))
    # await lsp_writer.send_document_update(
    #     "import torch\ntorch.nn.CrossEntropyLoss(", "test"
    # )
    # await lsp_writer.send_signature_help_request(1, 26, "test", "1234")
    # pprint(lsp.sent_msg_info.keys())
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())

    #  "initializationOptions": {
    #     "pythonVersion": "3.11",
    #     "pythonPlatform": "Windows",
    #     "pythonPath": "C:\\Users\\Kevin\\anaconda3\\envs\\abcde_env\\python",
    #     "typeCheckingMode": "strict"
