import asyncio
from collections import defaultdict


class LanguageServer:
    def __init__(self, workspace_folder, code_folder):
        self.workspace_folder = workspace_folder
        self.code_folder = code_folder
        self.msg_id_to_metadata = defaultdict(dict)
        self.versions = {}
        self.server = None

    async def start_server(self):
        print("starting server")
        self.server = await asyncio.create_subprocess_shell(
            # "pylyzer --server D:\\Documents\\App Development\\setta\\.setta_code\\test.py",
            # "pyright-langserver --stdio",
            # "pylsp",
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
    def msg_id_to_metadata(self):
        return self.server.msg_id_to_metadata

    @property
    def workspace_folder(self):
        return self.server.workspace_folder

    @property
    def code_folder(self):
        return self.server.code_folder

    @property
    def versions(self):
        return self.server.versions

    def get_new_version_number(self, uri, code, codeJson):
        obj = {"code": code, "codeJson": codeJson}
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
