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
        try:
            self.mcp_client.start()
            asyncio.run(self._connect_to_server())
        except KeyboardInterrupt:
            print("MCPClientRunner stopped by user", flush=True)

    async def _connect_to_server(self):
        async with websockets.connect(self.websocket_url) as websocket:
            self.mcp_client.websocket = websocket
            await self._handle_websocket(websocket)

    async def _handle_websocket(self, websocket):
        await self.mcp_client.ready.wait()

        await websocket.send(
            json.dumps(
                {"messageType": C.WS_SCRIPT_READY, "content": str(self.rel_path)}
            )
        )

        # Process incoming messages using async for
        async for message in websocket:
            message = json.loads(message)
            messageType = message["messageType"]
            if messageType == C.WS_MESSAGE_TO_LLM:
                content = message["content"]
                await self.mcp_client.process_query(
                    content["model"], content["messages"]
                )


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
