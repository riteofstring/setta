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

async def send_request(proc, method, params, request_id=1):
    request = json.dumps({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params
    }).encode('utf-8')
    content_length = len(request)
    header = f"Content-Length: {content_length}\r\n\r\n".encode('utf-8')
    proc.stdin.write(header + request)
    await proc.stdin.drain()

async def read_response(proc):
    # Read data until we receive a double newline, indicating end of headers
    headers = b''
    while True:
        chunk = await proc.stdout.read(1)
        headers += chunk
        if headers.endswith(b'\r\n\r\n'):
            break
    
    # Determine the content length from headers
    headers_str = headers.decode('utf-8')
    header_parts = headers_str.split('\r\n')
    content_length = 0
    for header in header_parts:
        if header.startswith('Content-Length:'):
            content_length = int(header.split(':')[1].strip())
            break

    # Read the exact amount of data specified by content length
    response = await proc.stdout.read(content_length)
    return json.loads(response.decode('utf-8'))

async def main():
    server = await start_server()

    # Initialize the server
    await send_request(server, "initialize", {"capabilities": {}, "rootUri": None})

    # Read and print the response
    response = await read_response(server)
    pprint(response)

    # Cleanup
    server.terminate()
    await server.wait()

if __name__ == "__main__":
    asyncio.run(main())
