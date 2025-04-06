import asyncio

from mcp import ClientSession
from mcp.client.sse import sse_client


class MCPClient:
    def start(self):
        self.reader_task = asyncio.create_task(self.run())

    async def run(self):
        attempt_delay = 1

        while True:
            try:
                print("Connection attempt...", flush=True)
                # Note the trailing slash added here
                async with sse_client(url="http://127.0.0.1:8000/mcp") as (
                    read,
                    write,
                ):
                    print("Connection successful!", flush=True)
                    print("read", read, flush=True)
                    print("write", write, flush=True)

                    async with ClientSession(read, write) as session:
                        print("going to initialize session", flush=True)
                        # Initialize the connection
                        await session.initialize()

                        # List available prompts
                        prompts = await session.list_prompts()
                        print("prompts", prompts, flush=True)

                        # List available resources
                        resources = await session.list_resources()
                        print("resources", resources, flush=True)

                        # List available tools
                        tools = await session.list_tools()
                        print("tools", tools, flush=True)

                # If we reach here, it means we successfully completed the session
                print("Session completed successfully", flush=True)
                break  # Exit the retry loop

            except asyncio.TimeoutError:
                print("Connection attempt timed out", flush=True)
            except Exception as e:
                print(f"Connection attempt failed: {e}", flush=True)

            print(f"Retrying in {attempt_delay} seconds...", flush=True)
            await asyncio.sleep(attempt_delay)

        print("exiting", flush=True)
