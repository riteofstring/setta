import asyncio
import json
from pprint import pprint

async def start_server():
    return await asyncio.create_subprocess_exec(
        'pylsp',
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

async def send_request(proc, method, params):
    request = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params
    }).encode('utf-8')
    content_length = len(request)
    header = f"Content-Length: {content_length}\r\n\r\n".encode('utf-8')
    proc.stdin.write(header + request)
    print("sending")
    pprint(request)
    await proc.stdin.drain()

async def read_response(proc):
    while True:
        headers = b''
        while True:
            chunk = await proc.stdout.read(1)
            headers += chunk
            if headers.endswith(b'\r\n\r\n'):
                break
        
        headers_str = headers.decode('utf-8')
        header_parts = headers_str.split('\r\n')
        print("headers", headers)
        content_length = 0
        for header in header_parts:
            if header.startswith('Content-Length:'):
                content_length = int(header.split(':')[1].strip())
                break
        
        response = await proc.stdout.read(content_length)
        print("response")
        print(response)
        response = json.loads(response.decode('utf-8'))
        pprint(response)

async def main():
    server = await start_server()
    loop = asyncio.get_running_loop()
    
    read_task = loop.create_task(read_response(server))

    # Initialize the server
    init_params = {"capabilities": {}, "rootUri": None}
    await send_request(server, "initialize", init_params)

    # Send a didOpen notification with Python code
    code_content = "import math\nprint(math.)"
    open_params = {
        "textDocument": {
            "uri": "file:///fakepath/file.py",
            "languageId": "python",
            "version": 1,
            "text": code_content
        }
    }
    await send_request(server, "textDocument/didOpen", open_params)

    # Optionally, send other requests like completion or symbol listing here
    # Send an autocompletion request
    completion_params = {
        "textDocument": {"uri": "file:///fakepath/file.py"},
        "position": {"line": 1, "character": len("print(math.")}  # cursor position after 'sqrt('
    }
    await send_request(server, "textDocument/completion", completion_params)


    _, pending = await asyncio.wait(
        [read_task], return_when=asyncio.FIRST_COMPLETED
    )
    
    for task in pending:
        task.cancel()
        await task  # Ensure task is properly cancelled

    server.terminate()
    await server.wait()

if __name__ == "__main__":
    asyncio.run(main())
