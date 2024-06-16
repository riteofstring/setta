import asyncio
import json
from collections import defaultdict

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
    return f"virtual://{root_path / code_id}.py"


class LanguageServer:
    def __init__(self, root_path):
        self.root_path = root_path
        self.sent_messages = {}
        self.server = None

    async def start_server(self):
        print("starting server")
        self.server = await asyncio.create_subprocess_exec(
            "pylsp",
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
        request_dict = {"jsonrpc": "2.0", "id": id, "method": method, "params": params}
        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        if id:
            self.sent_messages[id] = request_dict
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        init_params = {"capabilities": {}, "rootUri": get_file_uri(self.root_path)}
        await self.send_request("initialize", init_params)

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

    async def send_document_update(self, code, code_id):
        params = {
            "textDocument": {
                "uri": get_virtual_uri(self.root_path, code_id),
                "version": self.get_version_number(code_id),
            },
            "contentChanges": [{"text": code}],
        }
        await self.send_request("textDocument/didChange", params)

    @property
    def root_path(self):
        return self.server.root_path

    @property
    def sent_messages(self):
        return self.server.sent_messages

    def get_version_number(self, virtual_filename):
        self.versions[virtual_filename] += 1
        return self.versions[virtual_filename]


class LanguageServerListener:
    def __init__(self, server, websocket_manager):
        self.server = server
        self.websocket_manager = websocket_manager

    async def start_listener(self):
        loop = asyncio.get_running_loop()
        loop.create_task(self.read_response())
        print("listening")

    async def read_response(self):
        while True:
            headers = b""
            while True:
                chunk = await self.server.stdout.read(1)
                headers += chunk
                if headers.endswith(b"\r\n\r\n"):
                    break

            headers_str = headers.decode("utf-8")
            header_parts = headers_str.split("\r\n")
            content_length = 0
            for header in header_parts:
                if header.startswith("Content-Length:"):
                    content_length = int(header.split(":")[1].strip())
                    break

            response = await self.server.stdout.read(content_length)
            response = json.loads(response.decode("utf-8"))
            self.process_response(response)

    def process_response(self, response):
        id = response.get("id", None)
        if id:
            message_type = self.sent_messages[id]["method"]
            if message_type == "textDocument/completion":
                response = [
                    {"insertText": x["insertText"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                ]
            del self.sent_messages[id]

        # self.websocket_manager.send_message({})

        # print(self.received_messages.keys())
        print(response, flush=True)
        # process_response(response)

    @property
    def sent_messages(self):
        return self.server.sent_messages
