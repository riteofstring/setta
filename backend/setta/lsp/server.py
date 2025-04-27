import asyncio
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class LanguageServer:
    def __init__(self, workspace_folder, code_folder, settings, name):
        # Create folders if they don't exist
        workspace_folder.mkdir(parents=True, exist_ok=True)
        code_folder.mkdir(parents=True, exist_ok=True)
        self.workspace_folder = workspace_folder
        self.code_folder = code_folder
        self.init_properties()
        self.server = None
        if not isinstance(settings, dict):
            logger.warning(
                "warning: your language server settings is not an object, so it will have no effect"
            )
            self.settings = {}
        else:
            self.settings = settings
        self.name = name

    async def start_server(self):
        logger.debug(f"Starting {self.name} language server")
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
        self.initialization_request_id = None
        self.is_initialized = False
        self.temp_files = {}
        self.uris = set()

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

    def kill_server(self):
        try:
            logger.debug(f"Stopping {self.name} language server")
            self.server.terminate()
        except ProcessLookupError:
            pass
        for path in self.temp_files.values():
            if path.exists():
                path.unlink()

    @property
    def stdin(self):
        return self.server.stdin

    @property
    def stdout(self):
        return self.server.stdout


class LanguageServerInteractor:
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
    def code_folder(self):
        return self.server.code_folder

    @property
    def pending_requests(self):
        return self.server.pending_requests

    @property
    def temp_files(self):
        return self.server.temp_files

    @property
    def uris(self):
        return self.server.uris

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

    def project_code_folder(self, projectConfigName):
        return self.code_folder / projectConfigName
