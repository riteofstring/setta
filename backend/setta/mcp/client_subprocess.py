import argparse
import asyncio
import json
import random

import websockets

from setta.mcp.client import MCPClient
from setta.utils.constants import C


class MCPClientRunner:
    def __init__(self, mcp_server_url, websocket_url):
        self.mcp_client = MCPClient(server_url=mcp_server_url)
        self.websocket_url = websocket_url
        self.running = True
        self.max_reconnect_delay = 60  # Maximum reconnect delay in seconds

    def start(self):
        """Synchronous entry point that runs the async code"""
        try:
            asyncio.run(self._run_with_reconnection())
        except KeyboardInterrupt:
            print("MCPClientRunner stopped by user", flush=True)
        finally:
            self.running = False

    async def _run_with_reconnection(self):
        """Main loop that handles reconnection logic"""
        reconnect_delay = 1

        while self.running:
            try:
                # Start the MCP client connection
                connect_task = asyncio.create_task(self.mcp_client.connect_to_server())

                # Connect to the WebSocket with the reconnection logic
                print(f"Connecting to WebSocket at {self.websocket_url}...", flush=True)
                try:
                    async with websockets.connect(
                        self.websocket_url,
                        ping_interval=30,  # Send ping every 30 seconds
                        ping_timeout=10,  # Wait 10 seconds for pong response
                        close_timeout=5,  # Wait 5 seconds for close handshake
                    ) as websocket:
                        print("WebSocket connection established", flush=True)
                        self.mcp_client.websocket = websocket

                        # Reset reconnect delay on successful connection
                        reconnect_delay = 1

                        # Handle the WebSocket
                        await self._handle_websocket(websocket, connect_task)
                except websockets.exceptions.ConnectionClosedError as e:
                    print(f"WebSocket connection closed: {e}", flush=True)
                except websockets.exceptions.WebSocketException as e:
                    print(f"WebSocket error: {e}", flush=True)

            except Exception as e:
                print(f"Unexpected error: {e}", flush=True)

            # Only attempt to reconnect if we're still running
            if self.running:
                # Implement exponential backoff with jitter
                jitter = random.uniform(0, 0.5) * reconnect_delay
                actual_delay = reconnect_delay + jitter
                print(f"Reconnecting in {actual_delay:.2f} seconds...", flush=True)
                await asyncio.sleep(actual_delay)

                # Increase the delay for next time, but don't exceed max_reconnect_delay
                reconnect_delay = min(reconnect_delay * 1.5, self.max_reconnect_delay)

    async def _handle_websocket(self, websocket, connect_task):
        try:
            # Wait for MCP client to be ready
            await self.mcp_client.ready.wait()

            # Send ready message
            await websocket.send(json.dumps({"messageType": C.WS_SCRIPT_READY}))
            print("Sent ready message to frontend", flush=True)

            # Process incoming messages
            async for message in websocket:
                try:
                    message = json.loads(message)
                    messageType = message["messageType"]
                    if messageType == C.WS_MESSAGE_TO_LLM:
                        content = message["content"]
                        try:
                            await self.mcp_client.process_query(
                                content["model"],
                                content["messages"],
                                content["deepThink"],
                            )
                        except websockets.exceptions.ConnectionClosedError:
                            print(
                                "WebSocket connection closed during query processing",
                                flush=True,
                            )
                            return  # Exit the handler to trigger reconnection
                except Exception as e:
                    print(f"Error processing message: {e}", flush=True)

        except websockets.exceptions.ConnectionClosedError:
            print("WebSocket connection closed", flush=True)
        except Exception as e:
            print(f"Error in WebSocket handler: {e}", flush=True)
        finally:
            # If the websocket connection ends, cancel the connect_task if it's still running
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
