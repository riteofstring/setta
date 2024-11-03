import json
import platform
import uuid

from .server import LanguageServerInteractor


class LanguageServerWriter(LanguageServerInteractor):
    def __init__(self, server):
        self.server = server

    async def send_request(self, method, params, id=None):
        request_dict = {"jsonrpc": "2.0", "method": method, "params": params}
        if id:
            request_dict["id"] = id
            self.msg_id_to_metadata[id]["method"] = method
        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        # print(header + request, flush=True)
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        params = {
            "capabilities": {},
            "workspaceFolders": [{"uri": self.get_workspace_uri()}],
        }
        await self.send_request("initialize", params=params, id=str(uuid.uuid4()))
        await self.send_didChangeConfiguration()  # pyright requires this step

    async def send_document_open_request(self, code_id, code, codeJson=None):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {
                "uri": uri,
                "languageId": "python",
                "version": self.get_new_version_number(uri, code, codeJson),
                "text": code,
            }
        }
        await self.send_request("textDocument/didOpen", params=params)

    async def send_autocomplete_request(
        self,
        line,
        character,
        code_id,
        request_id,
        referencable_var_names,
        generated_var_names,
    ):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        self.msg_id_to_metadata[request_id][
            "referencable_var_names"
        ] = referencable_var_names
        self.msg_id_to_metadata[request_id]["generated_var_names"] = generated_var_names
        await self.send_request(
            "textDocument/completion",
            params=params,
            id=request_id,
        )

    async def send_signature_help_request(self, line, character, code_id, request_id):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
            "context": {"triggerKind": 2, "triggerCharacter": "("},
        }
        await self.send_request(
            "textDocument/signatureHelp",
            params=params,
            id=request_id,
        )

    async def send_hover_request(self, line, character, code_id, request_id):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/hover",
            params=params,
            id=request_id,
        )

    async def send_didChangeConfiguration(self):
        await self.send_request("workspace/didChangeConfiguration", params={})

    async def send_document_update(self, code_id, code, codeJson):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {
                "uri": uri,
                "version": self.get_new_version_number(uri, code, codeJson),
            },
            "contentChanges": [{"text": code}],
        }
        await self.send_request("textDocument/didChange", params=params)

    async def send_reference_request(
        self,
        position_offset,
        line,
        character,
        code_id,
        request_id,
        return_id,
    ):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {
                "uri": uri,
            },
            "position": {"line": line, "character": character},
            "context": {"includeDeclaration": False},
        }
        self.msg_id_to_metadata[request_id]["position_offset"] = position_offset
        self.msg_id_to_metadata[request_id]["return_id"] = return_id
        await self.send_request(
            "textDocument/references",
            params=params,
            id=request_id,
        )

    def get_workspace_uri(self):
        return f"file://{self.workspace_folder}".lower()

    def get_virtual_uri(self, code_id):
        uri = f"file://{self.code_folder / code_id}.py".lower()
        if platform.system() == "Windows":
            uri += "/"  # need trailing slash on Windows for some reason
        return uri
