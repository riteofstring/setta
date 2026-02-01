import asyncio
import json
import logging

from lsprotocol import converters as LSPConverters
from lsprotocol import types as LSPTypes

from setta.logging.errors import log_failure
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
        logger.debug("Starting %s language server reader", self.server.name)
        self.stop_event.clear()  # Reset the stop event
        self.reader_task = spawn_background_task(
            self.read_response(),
            label=f"lsp-reader-{self.server.name}",
            extra_values={"lsp_server": self.server.name},
        )
        await self.started.wait()

    async def stop(self):
        logger.debug("Stopping %s language server reader", self.server.name)
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
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log_failure(
                    exc,
                    label=f"lsp-reader-loop-{self.server.name}",
                    handled=False,
                )
                await asyncio.sleep(0.05)

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
            parsed = json.loads(response.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            log_failure(
                exc,
                label=f"lsp-reader-parse-{self.server.name}",
                handled=False,
                context={
                    "content_length": content_length,
                },
            )
            return

        try:
            self.process_response(parsed)
        except Exception as exc:
            context: dict[str, object] = {"content_length": content_length}
            msg_id = parsed.get("id")
            if msg_id is not None:
                context["lsp_msg_id"] = msg_id
            method = parsed.get("method")
            if method is not None:
                context["lsp_method"] = method
            log_failure(
                exc,
                label=f"lsp-reader-process-{self.server.name}",
                handled=False,
                context=context,
            )
            return

    def process_response(self, response):
        response_id = response.get("id")
        method = response.get("method")
        if response_id:
            self.process_response_with_id(response_id, method, response)
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
            diagnostics = response["params"].get("diagnostics", [])
            version = response["params"].get("version")
            callback = self.diagnostics_response_callbacks.get(uri)
            if callback:
                extra_values = {
                    "lsp_server": self.server.name,
                    "uri": uri,
                    "diagnostic_count": len(diagnostics),
                }
                if version is not None:
                    extra_values["lsp_version"] = version
                spawn_background_task(
                    callback(
                        self.lsp_converter.structure(
                            response,
                            LSPTypes.TextDocumentPublishDiagnosticsNotification,
                        )
                    ),
                    label="lsp-diagnostics-callback",
                    extra_values=extra_values,
                )
