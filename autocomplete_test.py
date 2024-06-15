import asyncio
import json
from pprint import pprint


class LSPManager:
    def __init__(self):
        self.messages = {}

    async def start_server(self):
        self.server = await asyncio.create_subprocess_exec(
            "pylsp",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        loop = asyncio.get_running_loop()
        loop.create_task(self.read_response())

    async def send_request(self, method, params):
        request = json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        ).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        print("sending")
        pprint(request)
        await self.server.stdin.drain()

    async def send_initialize_request(self):
        init_params = {"capabilities": {}, "rootUri": None}
        await self.send_request("initialize", init_params)

    async def send_document_open_request(self):
        code_content = "import math\nprint(math.)"
        open_params = {
            "textDocument": {
                "uri": "file:///fakepath/file.py",
                "languageId": "python",
                "version": 1,
                "text": code_content,
            }
        }
        await self.send_request("textDocument/didOpen", open_params)

    async def send_autocomplete_request(self, line, character):
        completion_params = {
            "textDocument": {"uri": "file:///fakepath/file.py"},
            "position": {"line": line, "character": character},
        }
        await self.send_request("textDocument/completion", completion_params)

    async def read_response(self):
        while True:
            headers = b""
            while True:
                chunk = await self.server.stdout.read(1)
                headers += chunk
                if headers.endswith(b"\r\n\r\n"):
                    break

            headers_str = headers.decode("utf-8")
            header_parts = headers_str.split("\r\n")
            content_length = 0
            for header in header_parts:
                if header.startswith("Content-Length:"):
                    content_length = int(header.split(":")[1].strip())
                    break

            response = await self.server.stdout.read(content_length)
            response = json.loads(response.decode("utf-8"))
            pprint(response)
            # process_response(response)


def process_response(response):
    print(response["method"])


async def main():
    lsp = LSPManager()
    await lsp.start_server()
    await lsp.send_initialize_request()
    await lsp.send_document_open_request()
    await lsp.send_autocomplete_request(1, 11)
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())
