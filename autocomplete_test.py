import asyncio
import json
from pprint import pprint
import uuid
from pathlib import Path


def create_id():
    return str(uuid.uuid4())


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


def get_virtual_uri(path):
    return f"virtual://{path}"


class LSPManager:
    def __init__(self, root_path):
        self.sent_messages = {}
        self.root_path = root_path

    async def start_server(self):
        self.server = await asyncio.create_subprocess_exec(
            "pylsp",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        loop = asyncio.get_running_loop()
        loop.create_task(self.read_response())
        await self.send_initialize_request()

    async def send_request(self, id, method, params):
        request_dict = {"jsonrpc": "2.0", "id": id, "method": method, "params": params}
        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        self.sent_messages[id] = request_dict
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        init_params = {"capabilities": {}, "rootUri": get_file_uri(self.root_path)}
        id = create_id()
        await self.send_request(id, "initialize", init_params)

    async def send_document_open_request(self):
        code_content = "import math\nprint(math.)"
        open_params = {
            "textDocument": {
                "uri": get_virtual_uri(self.root_path / "file.py"),
                "languageId": "python",
                "version": 1,
                "text": code_content,
            }
        }
        id = create_id()
        await self.send_request(id, "textDocument/didOpen", open_params)

    async def send_autocomplete_request(self, line, character):
        completion_params = {
            "textDocument": {"uri": get_virtual_uri(self.root_path / "file.py")},
            "position": {"line": line, "character": character},
        }
        id = create_id()
        await self.send_request(id, "textDocument/completion", completion_params)

    async def send_document_update(self, newText, version):
        params = {
            "textDocument": {
                "uri": get_virtual_uri(self.root_path / "file.py"),
                "version": version,
            },
            "contentChanges": [{"text": newText}],
        }
        id = create_id()
        await self.send_request(id, "textDocument/didChange", params)

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
                completions = [
                    {"insertText": x["insertText"], "type": type_mapping[x["kind"]]}
                    for x in response["result"]["items"]
                ]
                pprint(completions)
            del self.sent_messages[id]

        # print(self.received_messages.keys())
        pprint(response)
        # process_response(response)


async def main():
    lsp = LSPManager(
        root_path=Path("D:\\Documents\\App Development\\runcoder\\.runcoder_code")
    )
    await lsp.start_server()
    await lsp.send_document_open_request()
    await lsp.send_autocomplete_request(1, 11)
    await lsp.send_document_update("import math\nprint(math.sqrt(16))", version=2)
    pprint(lsp.sent_messages.keys())
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())
