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
        self.latest_version_numbers = {}  # uri to version number

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
    def pending_requests(self):
        return self.server.pending_requests

    @property
    def latest_version_numbers(self):
        return self.server.latest_version_numbers

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


# self.temp_files = {}
# code_folder.mkdir(parents=True, exist_ok=True)
# code_folder_section_perspective.mkdir(parents=True, exist_ok=True)


# for path in self.temp_files.values():
#     if path.exists():
#         path.unlink()


# # https://github.com/microsoft/language-server-protocol/issues/1676
# def get_uri(self, code_id, virtual):
#     uri = self.get_base_uri(code_id)
#     if virtual:
#         uri = uri.replace("file://", "untitled:", 1)
#     return uri

# def get_code_id_path(self, code_id):
#     return self.code_folder / f"{code_id}.py"

# def get_base_uri(self, code_id):
#     return self.get_code_id_path(code_id).as_uri()

# def create_temp_file(self, code_id, code):
#     """Create a temporary file for the given code and return its path."""
#     # Create all necessary parent directories
#     file_path = self.get_code_id_path(code_id)
#     logger.debug(f"Creating temporary file {file_path}")
#     file_path.parent.mkdir(parents=True, exist_ok=True)

#     # Write the code to the file
#     file_path.write_text(code)

#     # Store the path for later cleanup
#     self.temp_files[code_id] = file_path
#     return file_path

# def create_or_update_temp_file(self, code_id, code):
#     if code_id in self.temp_files:
#         self.temp_files[code_id].write_text(code)
#     else:
#         self.create_temp_file(code_id, code)
