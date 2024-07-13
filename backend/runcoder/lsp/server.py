import asyncio


class LanguageServer:
    def __init__(self, root_path):
        self.root_path = root_path
        self.sent_msg_info = {}
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
