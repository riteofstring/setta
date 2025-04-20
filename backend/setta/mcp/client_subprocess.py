import argparse
import asyncio
import json

import websockets

from setta.mcp.client import MCPClient
from setta.utils.constants import C


class MCPClientRunner:
    def __init__(self, mcp_server_url, websocket_url):
        self.mcp_client = MCPClient(server_url=mcp_server_url)
        self.websocket_url = websocket_url
        self.running = False

    def start(self):
        """Synchronous entry point that runs the async code"""
        try:
            asyncio.run(self._connect_to_server())
        except KeyboardInterrupt:
            print("MCPClientRunner stopped by user", flush=True)

    async def _connect_to_server(self):
        # Start the MCP client connection directly as an awaitable
        # instead of using create_task in a sync function
        connect_task = asyncio.create_task(self.mcp_client.connect_to_server())

        async with websockets.connect(self.websocket_url) as websocket:
            self.mcp_client.websocket = websocket
            await self._handle_websocket(websocket, connect_task)

    async def _handle_websocket(self, websocket, connect_task):
        # Wait for MCP client to be ready
        await self.mcp_client.ready.wait()

        # Send ready message
        # Note: You had self.rel_path which isn't defined anywhere in your class
        # I'm replacing it with a generic string, but you might need to fix this
        await websocket.send(json.dumps({"messageType": C.WS_SCRIPT_READY}))

        # Process incoming messages using async for
        async for message in websocket:
            message = json.loads(message)
            messageType = message["messageType"]
            if messageType == C.WS_MESSAGE_TO_LLM:
                content = message["content"]
                await self.mcp_client.process_query(
                    content["model"], content["messages"]
                )

        # If the websocket connection ends, cancel the connect_task
        if not connect_task.done():
            connect_task.cancel()
            try:
                await connect_task
            except asyncio.CancelledError:
                pass


def main():
    parser = argparse.ArgumentParser(description="MCPClient Subprocess")
    parser.add_argument("--mcp-server-url", help="URL of the MCP server")
    parser.add_argument(
        "--websocket-url", help="URL of the WebSocket server to connect to"
    )
    args = parser.parse_args()

    # Initialize and run
    runner = MCPClientRunner(args.mcp_server_url, args.websocket_url)
    runner.start()


if __name__ == "__main__":
    main()
