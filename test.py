import asyncio
import json
import uuid
import platform


class MinimalLanguageServer:
    def __init__(self):
        self.server = None
        self.initialized = False
        self.completion_request_id = None
        
    async def start_server(self):
        print("Starting server...")
        self.server = await asyncio.create_subprocess_shell(
            "basedpyright-langserver --stdio",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
    async def send_message(self, message):
        request = json.dumps(message).encode("utf-8")
        content_length = len(request)
        header = f"Content-Length: {content_length}\r\n\r\n".encode("utf-8")
        self.server.stdin.write(header + request)
        await self.server.stdin.drain()

    async def listen_for_responses(self):
        while True:
            header = await self.server.stdout.readline()
            if not header:
                break
                
            if header.startswith(b"Content-Length: "):
                content_length = int(header.decode("utf-8").split(": ")[1])
                await self.server.stdout.readline()  # Empty line
                content = await self.server.stdout.read(content_length)
                response = json.loads(content)
                
                # Only print completion responses
                if "id" in response and response["id"] == self.completion_request_id:
                    print(json.dumps(response, indent=2))
                
                # Handle initialization silently
                if not self.initialized and "result" in response and "capabilities" in response["result"]:
                    self.initialized = True
                    await self.send_message({
                        "jsonrpc": "2.0",
                        "method": "initialized",
                        "params": {}
                    })

async def main():
    ls = MinimalLanguageServer()
    await ls.start_server()
    
    # Initialize request
    init_params = {
        "capabilities": {},
        "workspaceFolders": [{"uri": "file:///workspace"}],
    }
    await ls.send_message({
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": "initialize",
        "params": init_params
    })
    
    # Open document
    test_code = "os"
    doc_uri = "untitled:/test.py"
    if platform.system() == "Windows":
        doc_uri += "/"  # needed on Windows
    await ls.send_message({
        "jsonrpc": "2.0",
        "method": "textDocument/didOpen",
        "params": {
            "textDocument": {
                "uri": doc_uri,
                "languageId": "python",
                "version": 1,
                "text": test_code
            }
        }
    })
    
    # Send completion request
    ls.completion_request_id = str(uuid.uuid4())
    await ls.send_message({
        "jsonrpc": "2.0",
        "id": ls.completion_request_id,
        "method": "textDocument/completion",
        "params": {
            "textDocument": {"uri": doc_uri},
            "position": {"line": 0, "character": 2}
        }
    })
    
    # Listen for responses
    await ls.listen_for_responses()

if __name__ == "__main__":
    asyncio.run(main())