import asyncio
from collections import defaultdict
from pathlib import Path


class LanguageServer:
    def __init__(self, workspace_folder, code_folder, settings):
        self.workspace_folder = workspace_folder
        self.code_folder = code_folder
        self.init_properties()
        self.server = None
        if not isinstance(settings, dict):
            print(
                "warning: your language server settings is not an object, so it will have no effect"
            )
            self.settings = {}
        else:
            self.settings = settings

    async def start_server(self):
        print("starting server")
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
        self.versions = {}
        self.initialization_request_id = None
        self.is_initialized = False
        self.temp_files = {}

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
    def code_folder(self):
        return self.server.code_folder

    @property
    def pending_requests(self):
        return self.server.pending_requests

    @property
    def temp_files(self):
        return self.server.temp_files

    async def wait_for_response(self, id, timeout=None):
        future = self.pending_requests.get(id)
        if future:
            try:
                result = await asyncio.wait_for(future, timeout=timeout)
                return result
            except ConnectionResetError as e:
                # Handle the error case
                pass
            finally:
                self.pending_requests.pop(id, None)
        return None

    def project_code_folder(self, projectConfigName):
        return self.code_folder / projectConfigName

    def construct_code_id(self, projectConfigName, sectionName):
        return str(Path(projectConfigName) / sectionName)

    @property
    def versions(self):
        return self.server.versions

    def get_new_version_number(self, uri, code, codeJson, is_gen_code):
        obj = {"code": code, "codeJson": codeJson, "is_gen_code": is_gen_code}
        if uri not in self.versions:
            self.versions[uri] = {0: obj}
            new_version = 0
        else:
            new_version = max(self.versions[uri].keys()) + 1
            self.versions[uri][new_version] = obj
        return new_version

    def get_version(self, uri, version_num=None):
        uri = uri.lower()
        version_num = (
            max(self.versions[uri].keys()) if version_num is None else version_num
        )
        return self.versions[uri][version_num]
