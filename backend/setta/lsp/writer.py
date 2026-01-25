import asyncio
import json
import logging
import uuid
from pathlib import Path

from setta.logging.context import logging_context

from .server import LanguageServer, LanguageServerInteractor

logger = logging.getLogger(__name__)

_MAX_LOGGED_PARAMS_KEYS = 25


def _summarize_params(params: object) -> object:
    if isinstance(params, dict):
        keys = sorted(str(key) for key in params.keys())
        if len(keys) > _MAX_LOGGED_PARAMS_KEYS:
            return {
                "keys": keys[:_MAX_LOGGED_PARAMS_KEYS],
                "len": len(keys),
                "truncated": True,
            }
        return {"keys": keys}
    if isinstance(params, (list, tuple)):
        return {"len": len(params)}
    return type(params).__name__


class LanguageServerWriter(LanguageServerInteractor):
    def __init__(self, server: LanguageServer):
        super().__init__(server)

    async def send_request(self, method, params, id=None):
        request_dict = {"jsonrpc": "2.0", "method": method, "params": params}
        if id:
            request_dict["id"] = id
            self.msg_id_to_metadata[id]["method"] = method

        request = json.dumps(request_dict).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        try:
            stdin = self.server.stdin
        except ValueError:
            logger.debug("Skipping %s; language server process is not ready", method)
            return
        stdin.write(header + request)
        await stdin.drain()
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Sent %s (params=%s)", method, _summarize_params(params))

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
        await self.send_did_change_configuration()  # pyright requires this step

    async def send_document_open_request(
        self, filepath, code, diagnostics_callback=None
    ):
        uri = self.get_uri(filepath)
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
            logger.debug("send_document_open_request %s", uri)
            await self.send_request("textDocument/didOpen", params=params)
        else:
            logger.debug("document already open, updating it %s", uri)
            await self.send_document_update(
                filepath=filepath,
                code=code,
            )
        return uri

    async def send_document_close_request(self, filepath):
        uri = self.get_uri(filepath)
        params = {"textDocument": {"uri": uri}}
        await self.send_request("textDocument/didClose", params=params)
        self.latest_version_numbers.pop(uri, None)
        self.remove_diagnostics_response_callback(uri)

    async def send_document_update(self, filepath, code):
        uri = self.get_uri(filepath)
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
    ):
        uri = self.get_uri(filepath)
        params = {
            "textDocument": {"uri": uri},
            "position": {"line": line, "character": character},
        }
        await self.send_request(
            "textDocument/completion",
            params=params,
            id=request_id,
        )

    async def send_signature_help_request(self, filepath, line, character, request_id):
        uri = self.get_uri(filepath)
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

    async def send_did_change_configuration(self):
        # THIS FORMAT WORKS
        # settings = {
        #     "basedpyright": {"analysis": {"exclude": ["setta_code"]}}
        # }

        await self.send_request(
            "workspace/didChangeConfiguration",
            params={"settings": self.settings},
        )

    async def send_did_change_watched_files(self, changes):
        params = {"changes": changes}
        await self.send_request("workspace/didChangeWatchedFiles", params=params)

    async def send_and_wait(self, fn_call, request_id):
        self.pending_requests[request_id] = asyncio.Future()
        with logging_context(
            values={
                "task": "lsp-send-request",
                "lsp_request_id": request_id,
                "lsp_server": self.server.name,
            }
        ):
            await fn_call
            return await self.wait_for_response(request_id)

    # https://github.com/microsoft/language-server-protocol/issues/1676
    def get_uri(self, filepath: Path):
        return filepath.absolute().as_uri()
