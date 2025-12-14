import asyncio
import json
import logging

from lsprotocol import converters as LSPConverters
from lsprotocol import types as LSPTypes

from setta.logging.context_bindings import wrap_background_coroutine
from setta.logging.tasks import spawn_background_task

from .server import LanguageServer, LanguageServerInteractor

logger = logging.getLogger(__name__)


class LanguageServerReader(LanguageServerInteractor):
    def __init__(self, server: LanguageServer, initialized_callback=None):
        super().__init__(server)
        self.stop_event = asyncio.Event()
        self.started = asyncio.Event()
        self.reader_task = None
        self.initialized_callback = initialized_callback
        self.lsp_converter = LSPConverters.get_converter()

    async def start(self):
        logger.debug(f"Starting {self.server.name} language server reader")
        self.stop_event.clear()  # Reset the stop event
        self.reader_task = asyncio.create_task(
            wrap_background_coroutine(
                self.read_response(),
                label=f"lsp-reader-{self.server.name}",
                extra_values={"lsp_server": self.server.name},
            )
        )
        await self.started.wait()

    async def stop(self):
        logger.debug(f"Stopping {self.server.name} language server reader")
        self.stop_event.set()
        self.started.clear()
        if self.reader_task:
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass

    async def read_response(self):
        self.started.set()
        while not self.stop_event.is_set():
            try:
                await self.read_and_process_message()
            except Exception as e:
                logger.error(f"Error reading from language server: {e}")
                # Optional: add a small delay to prevent tight loop if there's a persistent error
                await asyncio.sleep(0.1)

    async def read_and_process_message(self):
        try:
            stdout = self.server.stdout
        except ValueError:
            await asyncio.sleep(0.05)
            return

        headers = b""
        while not self.stop_event.is_set():
            chunk = await stdout.read(1)
            if not chunk:
                # Server stdout closed/EOF reached
                self.stop_event.set()  # Signal to stop
                return
            headers += chunk
            if headers.endswith(b"\r\n\r\n"):
                break

        if self.stop_event.is_set():
            return

        headers_str = headers.decode("utf-8")
        header_parts = headers_str.split("\r\n")
        content_length = 0
        for header in header_parts:
            if header.startswith("Content-Length:"):
                content_length = int(header.split(":")[1].strip())
                break

        response = b""
        while len(response) < content_length and not self.stop_event.is_set():
            chunk = await stdout.read(content_length - len(response))
            if not chunk:
                # Server stdout closed/EOF reached
                self.stop_event.set()  # Signal to stop
                return
            response += chunk

        if self.stop_event.is_set():
            return

        try:
            response = json.loads(response.decode("utf-8"))
            self.process_response(response)
        except json.JSONDecodeError as e:
            logger.debug(f"Error decoding JSON response: {e}")
            return
        except Exception as e:
            logger.debug(f"Error processing response: {e}")
            return

    def process_response(self, response):
        logger.debug(f"Processing response: {response}")
        id = response.get("id", None)
        method = response.get("method", None)
        if id:
            self.process_response_with_id(id, method, response)
        else:
            self.process_response_without_id(method, response)

    def process_response_with_id(self, id, method, response):
        metadata = self.msg_id_to_metadata.pop(id, {})
        method = method if method else metadata["method"]

        if (
            not self.server.is_initialized
            and id == self.server.initialization_request_id
        ):
            self.server.is_initialized = True
            if self.initialized_callback:
                self.initialized_callback()
        else:
            if id in self.pending_requests:
                if method == "textDocument/signatureHelp":
                    response = self.lsp_converter.structure(
                        response, LSPTypes.TextDocumentSignatureHelpResponse
                    )
                self.pending_requests[id].set_result(response)

    def process_response_without_id(self, method, response):
        if method == "textDocument/publishDiagnostics":
            uri = response["params"]["uri"]
            callback = self.diagnostics_response_callbacks.get(uri)
            if callback:
                spawn_background_task(
                    callback(
                        self.lsp_converter.structure(
                            response,
                            LSPTypes.TextDocumentPublishDiagnosticsNotification,
                        )
                    ),
                    label="lsp-diagnostics-callback",
                    extra_values={
                        "lsp_server": self.server.name,
                        "uri": uri,
                    },
                )
