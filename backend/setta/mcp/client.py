import asyncio
from contextlib import AsyncExitStack

from anthropic.types import ToolParam
from mcp import ClientSession
from mcp.client.sse import sse_client


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url: str):
        # Initialize session and client objects
        self.session: ClientSession | None = None
        self.exit_stack = AsyncExitStack()
        self.server_url = server_url
        self.available_tools: list[ToolParam] = []

    async def connect_to_server(self, retry_delay=1):
        """Connect to an MCP server over HTTP with retry logic

        Args:
            url: URL to the MCP server
            retry_delay: Delay between retry attempts in seconds
        """
        print("Starting MCP client connection...", flush=True)
        url = self.server_url

        while True:
            try:
                print(f"Attempting to connect to {url}...", flush=True)

                # Create and enter the SSE client context
                stdio_transport = await self.exit_stack.enter_async_context(
                    sse_client(url=url)
                )
                self.read, self.write = stdio_transport

                # Create and enter the client session context
                self.session = await self.exit_stack.enter_async_context(
                    ClientSession(self.read, self.write)
                )

                # Initialize the session
                await self.session.initialize()
                print(f"Connected to {url}...", flush=True)
                # List available tools to verify connection
                response = await self.session.list_tools()
                self.available_tools = [
                    ToolParam(
                        name=tool.name,
                        description=tool.description if tool.description else "",
                        input_schema=tool.inputSchema,
                    )
                    for tool in response.tools
                ]

                # Keep the connection alive (this will block until an exception occurs)
                await self._keep_alive()

            except asyncio.TimeoutError:
                print(
                    f"Connection timed out, retrying in {retry_delay} seconds...",
                    flush=True,
                )
            except Exception as e:
                print(f"Connection error: {e}", flush=True)
                print(f"Retrying in {retry_delay} seconds...", flush=True)

            # Close any open contexts before retrying
            await self.exit_stack.aclose()
            self.exit_stack = (
                AsyncExitStack()
            )  # Create a new stack for the next attempt

            # Wait before retrying
            await asyncio.sleep(retry_delay)

    async def _keep_alive(self):
        """Keep the connection alive"""
        if not self.session:
            raise ValueError

        while True:
            await asyncio.sleep(10)
            await self.session.send_ping()

    async def call_tool(self, tool_name: str, tool_args: dict):
        if not self.session:
            raise ValueError

        return await self.session.call_tool(tool_name, tool_args)

    async def stop(self):
        # Then close the exit stack to release resources
        await self.exit_stack.aclose()

        # Set flags to indicate shutdown
        self._shutdown = True
        print("MCPClient resources cleaned up successfully")
