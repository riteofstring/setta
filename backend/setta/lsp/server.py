import asyncio
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class LanguageServer:
    def __init__(
        self,
        workspace_folder,
        settings,
        name,
    ):
        # Create folders if they don't exist
        workspace_folder.mkdir(parents=True, exist_ok=True)
        self.workspace_folder = workspace_folder
        self.server = None
        self.init_properties()
        if not isinstance(settings, dict):
            logger.warning(
                "warning: your language server settings is not an object, so it will have no effect"
            )
            self.settings = {}
        else:
            self.settings = settings
        self.name = name

    async def start(self):
        logger.debug("Starting %s language server", self.name)
        self.init_properties()
        self.server = await asyncio.create_subprocess_shell(
            "basedpyright-langserver --stdio",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

    def init_properties(self):
        self.cleanup_pending_requests()
        self.pending_requests = {}
        self.msg_id_to_metadata = defaultdict(dict)
        self.initialization_request_id: str | None = None
        self.is_initialized = False
        self.latest_version_numbers = {}  # uri to version number
        self.diagnostics_response_callbacks = {}  # uri to callback

    def cleanup_pending_requests(self):
        if not hasattr(self, "pending_requests"):
            return
        # Cancel all pending futures with an appropriate error
        for future in self.pending_requests.values():
            if not future.done():
                future.set_exception(
                    ConnectionResetError("Language server was restarted")
                )
        self.pending_requests.clear()

    def stop(self):
        process = getattr(self, "server", None)
        if not process:
            return
        try:
            logger.debug("Stopping %s language server", self.name)
            process.terminate()
        except ProcessLookupError:
            pass
        finally:
            self.server = None

    @property
    def stdin(self):
        process = getattr(self, "server", None)
        if process and process.stdin:
            return process.stdin
        raise ValueError("Language server stdin is not available (process not started)")

    @property
    def stdout(self):
        process = getattr(self, "server", None)
        if process and process.stdout:
            return process.stdout
        raise ValueError(
            "Language server stdout is not available (process not started)"
        )


class LanguageServerInteractor:
    def __init__(self, server: LanguageServer):
        self.server = server

    @property
    def settings(self):
        return self.server.settings

    @property
    def msg_id_to_metadata(self):
        return self.server.msg_id_to_metadata

    @property
    def workspace_folder(self):
        return self.server.workspace_folder

    @property
    def pending_requests(self):
        return self.server.pending_requests

    @property
    def latest_version_numbers(self):
        return self.server.latest_version_numbers

    @property
    def diagnostics_response_callbacks(self):
        return self.server.diagnostics_response_callbacks

    async def wait_for_response(self, id, timeout=None):
        future = self.pending_requests.get(id)
        if future:
            try:
                result = await asyncio.wait_for(future, timeout=timeout)
                return result
            except ConnectionResetError:
                # Handle the error case
                pass
            finally:
                self.pending_requests.pop(id, None)
        return None

    def get_latest_version_number(self, uri):
        return self.latest_version_numbers.get(uri)

    def add_diagnostics_response_callback(self, uri, callback):
        self.diagnostics_response_callbacks[uri] = callback

    def remove_diagnostics_response_callback(self, uri):
        self.diagnostics_response_callbacks.pop(uri, None)
