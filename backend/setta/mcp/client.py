import asyncio
from contextlib import AsyncExitStack
from typing import Optional

# from anthropic import Anthropic
from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.sse import sse_client

load_dotenv()  # load environment variables from .env


# adapted from: https://github.com/modelcontextprotocol/quickstart-resources/blob/main/mcp-client-python/client.py
class MCPClient:
    def __init__(self, server_url):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        # self.anthropic = Anthropic()
        self.reader_task = None
        self.server_url = server_url

    def start(self):
        """Start the connection process in the background"""
        self.reader_task = asyncio.create_task(self.connect_to_server())

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

                # List available tools to verify connection
                response = await self.session.list_tools()
                tools = response.tools
                print(
                    "\nConnected to server with tools:",
                    [tool.name for tool in tools],
                    flush=True,
                )

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
        # This method will block until the connection is broken
        # We could implement periodic health checks here if needed
        while True:
            await asyncio.sleep(60)  # Check connection every minute
            # Optional: Perform a lightweight operation to verify connection
            await self.session.list_tools()

    async def process_query(self, query: str) -> str:
        """Process a query using Claude and available tools"""
        if not self.session:
            raise RuntimeError("Not connected to MCP server")

        messages = [{"role": "user", "content": query}]

        response = await self.session.list_tools()
        available_tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.inputSchema,
            }
            for tool in response.tools
        ]

        # Initial Claude API call
        response = self.anthropic.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            messages=messages,
            tools=available_tools,
        )

        # Process response and handle tool calls
        final_text = []

        for content in response.content:
            if content.type == "text":
                final_text.append(content.text)
            elif content.type == "tool_use":
                tool_name = content.name
                tool_args = content.input

                # Execute tool call
                result = await self.session.call_tool(tool_name, tool_args)
                final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")

                # Continue conversation with tool results
                if hasattr(content, "text") and content.text:
                    messages.append({"role": "assistant", "content": content.text})
                messages.append({"role": "user", "content": result.content})

                # Get next response from Claude
                response = self.anthropic.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=1000,
                    messages=messages,
                )

                final_text.append(response.content[0].text)

        return "\n".join(final_text)

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")

        while True:
            try:
                query = input("\nQuery: ").strip()

                if query.lower() == "quit":
                    break

                if not self.session:
                    print("Waiting for connection to MCP server...")
                    await asyncio.sleep(1)
                    continue

                response = await self.process_query(query)
                print("\n" + response)

            except Exception as e:
                print(f"\nError: {str(e)}")

    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()
        if self.reader_task and not self.reader_task.done():
            self.reader_task.cancel()
            try:
                await self.reader_task
            except asyncio.CancelledError:
                pass
