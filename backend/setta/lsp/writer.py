import asyncio
import json
import logging
import uuid

from setta.utils.utils import recursive_dict_merge

from .server import LanguageServerInteractor

logger = logging.getLogger(__name__)


class LanguageServerWriter(LanguageServerInteractor):
    def __init__(self, server, use_virtual_files):
        self.server = server
        self.use_virtual_files = use_virtual_files

    async def send_request(self, method, params, id=None):
        request_dict = {"jsonrpc": "2.0", "method": method, "params": params}
        if id:
            request_dict["id"] = id
            self.msg_id_to_metadata[id]["method"] = method

        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()
        logger.debug(f"Sent {method} with params: {params}")

    async def start(self):
        params = {
            "capabilities": {
                "workspace": {"didChangeWatchedFiles": {"dynamicRegistration": True}}
            },
            "workspaceFolders": [{"uri": self.workspace_folder.as_uri()}],
        }
        request_id = str(uuid.uuid4())
        self.server.initialization_request_id = request_id
        await self.send_request("initialize", params=params, id=request_id)
        await self.send_didChangeConfiguration()  # pyright requires this step

    async def send_document_open_request(
        self, filepath, code, virtual=None, diagnostics_callback=None
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(filepath, virtual)
        if diagnostics_callback:
            self.add_diagnostics_response_callback(uri, diagnostics_callback)
        if uri not in self.latest_version_numbers:
            version = 0
            self.latest_version_numbers[uri] = version
            params = {
                "textDocument": {
                    "uri": uri,
                    "languageId": "python",
                    "version": version,
                    "text": code,
                }
            }
            logger.debug(f"send_document_open_request {uri}")
            await self.send_request("textDocument/didOpen", params=params)
        else:
            logger.debug(f"document already open, updating it {uri}")
            await self.send_document_update(
                filepath=filepath,
                code=code,
            )
        return uri

    async def send_document_update(self, filepath, code, virtual=None):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(filepath, virtual)
        version = self.latest_version_numbers[uri] + 1
        self.latest_version_numbers[uri] = version
        params = {
            "textDocument": {
                "uri": uri,
                "version": version,
            },
            "contentChanges": [{"text": code}],
        }
        await self.send_request("textDocument/didChange", params=params)

    async def send_autocomplete_request(
        self,
        filepath,
        line,
        character,
        request_id,
        virtual=None,
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(filepath, virtual)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/completion",
            params=params,
            id=request_id,
        )

    async def send_signature_help_request(
        self, filepath, line, character, request_id, virtual=None
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(filepath, virtual)
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
        self,
        line,
        character,
        code_id,
        request_id,
        return_id,
        num_messages,
        virtual=None,
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(code_id, virtual)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        self.msg_id_to_metadata[request_id]["return_id"] = return_id
        self.msg_id_to_metadata[request_id]["num_messages"] = num_messages
        self.msg_id_to_metadata[request_id]["code"] = self.get_code_metadata(uri)[
            "code"
        ]
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

    async def send_reference_request(
        self,
        position_offset,
        line,
        character,
        code_id,
        request_id,
        return_id,
        num_messages,
        virtual=None,
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(code_id, virtual)
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
        self.msg_id_to_metadata[request_id]["code"] = self.get_code_metadata(uri)[
            "code"
        ]
        await self.send_request("textDocument/references", params=params, id=request_id)

    async def send_definition_request(
        self,
        line,
        character,
        filepath,
        request_id,
        virtual=None,
    ):
        virtual = self.get_is_virtual(virtual)
        uri = self.get_uri(filepath, virtual)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/definition",
            params=params,
            id=request_id,
        )

    async def send_did_change_watched_files(self, changes):
        params = {"changes": changes}
        await self.send_request("workspace/didChangeWatchedFiles", params=params)

    async def send_and_wait(self, fn_call, request_id):
        self.pending_requests[request_id] = asyncio.Future()
        asyncio.create_task(fn_call)
        return await self.wait_for_response(request_id)

    def get_is_virtual(self, virtual):
        return virtual if virtual is not None else self.use_virtual_files

    # https://github.com/microsoft/language-server-protocol/issues/1676
    def get_uri(self, filepath, virtual):
        uri = filepath.as_uri()
        if virtual:
            uri = uri.replace("file://", "untitled:", 1)
        return uri
