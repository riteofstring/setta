import asyncio
from collections import defaultdict
from pathlib import Path


class LanguageServer:
    def __init__(self, workspace_folder, code_folder, settings):
        self.workspace_folder = workspace_folder
        self.code_folder = code_folder
        self.msg_id_to_metadata = defaultdict(dict)
        self.versions = {}
        self.initialization_request_id = None
        self.is_initialized = False
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
        self.initialization_request_id = None
        self.is_initialized = False
        self.server = await asyncio.create_subprocess_shell(
            "basedpyright-langserver --stdio",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

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
