import asyncio
import json
import platform
import uuid

from setta.utils.utils import recursive_dict_merge

from .server import LanguageServerInteractor


class LanguageServerWriter(LanguageServerInteractor):
    def __init__(self, server):
        self.server = server

    async def send_request(self, method, params, id=None, local=False):
        request_dict = {"jsonrpc": "2.0", "method": method, "params": params}
        if id:
            request_dict["id"] = id
            self.msg_id_to_metadata[id]["method"] = method
            if local:
                self.pending_requests[id] = asyncio.Future()

        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        params = {
            "capabilities": {
                "workspace": {"didChangeWatchedFiles": {"dynamicRegistration": True}}
            },
            "workspaceFolders": [{"uri": self.get_workspace_uri()}],
        }
        request_id = str(uuid.uuid4())
        self.server.initialization_request_id = request_id
        await self.send_request("initialize", params=params, id=request_id)
        await self.send_didChangeConfiguration()  # pyright requires this step

    async def send_document_open_request(
        self, code_id, code, codeJson=None, is_gen_code=False
    ):
        uri = self.get_virtual_uri(code_id)
        print("uri", uri, flush=True)
        if uri not in self.versions:
            print("send_document_open_request", code_id, flush=True)
            params = {
                "textDocument": {
                    "uri": uri,
                    "languageId": "python",
                    "version": self.get_new_version_number(
                        uri, code, codeJson, is_gen_code
                    ),
                    "text": code,
                }
            }
            await self.send_request("textDocument/didOpen", params=params)
        else:
            print("document already open, updating it", code_id, flush=True)
            await self.send_document_update(code_id, code, codeJson, is_gen_code)

    async def send_autocomplete_request(
        self,
        line,
        character,
        code_id,
        request_id,
        referencable_var_names,
        generated_var_names,
        cursor_offset,
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
        self.msg_id_to_metadata[request_id]["uri"] = uri
        self.msg_id_to_metadata[request_id]["cursor_offset"] = cursor_offset
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

    async def send_document_highlight_request(
        self, line, character, code_id, request_id, return_id, num_messages
    ):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        self.msg_id_to_metadata[request_id]["return_id"] = return_id
        self.msg_id_to_metadata[request_id]["num_messages"] = num_messages
        # the response doesn't include uri for some reason,
        # so we keep track of it manually
        self.msg_id_to_metadata[request_id]["uri"] = uri
        await self.send_request(
            "textDocument/documentHighlight",
            params=params,
            id=request_id,
        )

    async def send_didChangeConfiguration(self):
        # THIS FORMAT WORKS
        # hardcoded_settings = {
        #     "basedpyright": {"analysis": {"exclude": ["setta_code"]}}
        # }
        hardcoded_settings = {}
        settings = recursive_dict_merge(hardcoded_settings, self.settings)

        await self.send_request(
            "workspace/didChangeConfiguration",
            params={"settings": settings},
        )

    async def send_document_update(self, code_id, code, codeJson, is_gen_code):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {
                "uri": uri,
                "version": self.get_new_version_number(
                    uri, code, codeJson, is_gen_code
                ),
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
        num_messages,
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
        self.msg_id_to_metadata[request_id]["num_messages"] = num_messages
        await self.send_request(
            "textDocument/references",
            params=params,
            id=request_id,
        )

    async def send_definition_request(
        self,
        line,
        character,
        code_id,
        request_id,
        local=False,
    ):
        uri = self.get_virtual_uri(code_id)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/definition", params=params, id=request_id, local=local
        )

    async def send_did_change_watched_files(self, changes):
        params = {"changes": changes}
        await self.send_request("workspace/didChangeWatchedFiles", params=params)

    def get_workspace_uri(self):
        return f"file://{self.workspace_folder}".lower()

    # https://github.com/microsoft/language-server-protocol/issues/1676
    def get_virtual_uri(self, code_id):
        uri = f"untitled:{self.code_folder / code_id}.py".lower()
        if platform.system() == "Windows":
            uri += "/"  # need trailing slash on Windows for some reason
        return uri
