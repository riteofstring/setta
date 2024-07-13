import json
import uuid
from collections import defaultdict


def get_file_uri(path):
    return f"file://{path}"


def get_virtual_uri(root_path, code_id):
    return f"file://{root_path / code_id}.py"


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
        print(header + request, flush=True)
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        init_params = {
            "capabilities": {},
            "workspaceFolders": [{"uri": get_file_uri(self.root_path)}],
        }
        await self.send_request("initialize", init_params, id=str(uuid.uuid4()))
        await self.send_didChangeConfiguration()  # pyright requires this step

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

    async def send_signature_help_request(self, line, character, code_id, request_id):
        completion_params = {
            "textDocument": {"uri": get_virtual_uri(self.root_path, code_id)},
            "position": {"line": line, "character": character},
            "context": {"triggerKind": 2, "triggerCharacter": "("},
        }
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

    @property
    def root_path(self):
        return self.server.root_path

    @property
    def sent_msg_info(self):
        return self.server.sent_msg_info

    def get_version_number(self, virtual_filename):
        self.versions[virtual_filename] += 1
        return self.versions[virtual_filename]
