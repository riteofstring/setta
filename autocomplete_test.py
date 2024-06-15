import asyncio
import json
from pprint import pprint


async def send_autocomplete_request(server, line, character):
    completion_params = {
        "textDocument": {"uri": "file:///fakepath/file.py"},
        "position": {"line": line, "character": character},
    }
    await send_request(server, "textDocument/completion", completion_params)


async def send_initialize_request(server):
    init_params = {"capabilities": {}, "rootUri": None}
    await send_request(server, "initialize", init_params)


async def send_document_open_request(server):
    code_content = "import math\nprint(math.)"
    open_params = {
        "textDocument": {
            "uri": "file:///fakepath/file.py",
            "languageId": "python",
            "version": 1,
            "text": code_content,
        }
    }
    await send_request(server, "textDocument/didOpen", open_params)


async def start_server():
    return await asyncio.create_subprocess_exec(
        "pylsp",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )


async def send_request(proc, method, params):
    request = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode("utf-8")
    content_length = len(request)
    header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
    proc.stdin.write(header + request)
    print("sending")
    pprint(request)
    await proc.stdin.drain()


async def read_response(proc):
    while True:
        headers = b""
        while True:
            chunk = await proc.stdout.read(1)
            headers += chunk
            if headers.endswith(b"\r\n\r\n"):
                break

        headers_str = headers.decode("utf-8")
        header_parts = headers_str.split("\r\n")
        print("headers", headers)
        content_length = 0
        for header in header_parts:
            if header.startswith("Content-Length:"):
                content_length = int(header.split(":")[1].strip())
                break

        response = await proc.stdout.read(content_length)
        print("response")
        print(response)
        response = json.loads(response.decode("utf-8"))
        pprint(response)


async def main():
    server = await start_server()
    loop = asyncio.get_running_loop()
    loop.create_task(read_response(server))
    await send_initialize_request(server)
    await send_document_open_request(server)
    await send_autocomplete_request(server, 1, 11)
    await server.wait()


if __name__ == "__main__":
    asyncio.run(main())
