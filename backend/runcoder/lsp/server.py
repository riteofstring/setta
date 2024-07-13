import asyncio


class LanguageServer:
    def __init__(self, root_path):
        self.root_path = root_path
        self.msg_id_to_method = {}
        self.versions = {}
        self.server = None

    async def start_server(self):
        print("starting server")
        self.server = await asyncio.create_subprocess_shell(
            # "pylyzer --server D:\\Documents\\App Development\\runcoder\\.runcoder_code\\test.py",
            # "pyright-langserver --stdio",
            # "pylsp",
            "basedpyright-langserver --stdio",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

    def kill_server(self):
        self.server.terminate()

    @property
    def stdin(self):
        return self.server.stdin

    @property
    def stdout(self):
        return self.server.stdout


class LanguageServerInteractor:
    @property
    def msg_id_to_method(self):
        return self.server.msg_id_to_method

    @property
    def root_path(self):
        return self.server.root_path

    @property
    def versions(self):
        return self.server.versions

    def get_new_version_number(self, uri, code):
        if uri not in self.versions:
            self.versions[uri] = {0: code}
            new_version = 0
        else:
            new_version = max(self.versions[uri].keys()) + 1
            self.versions[uri][new_version] = code
        return new_version
