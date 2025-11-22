import asyncio
import types
import unittest
from contextlib import suppress

from setta.mcp import client as mcp_client_module
from setta.mcp.client import MCPClient


class StubSSEContext:
    opened = 0
    closed = 0

    def __init__(self, url: str) -> None:
        self.url = url

    async def __aenter__(self):
        type(self).opened += 1
        return object(), object()

    async def __aexit__(self, exc_type, exc, tb):
        type(self).closed += 1
        return False


class StubClientSession:
    closed = 0

    def __init__(self, read, write) -> None:
        self.read = read
        self.write = write
        self.initialized = False
        self.pings = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        type(self).closed += 1
        return False

    async def initialize(self):
        self.initialized = True

    async def list_tools(self):
        return types.SimpleNamespace(
            tools=[
                types.SimpleNamespace(
                    name="echo",
                    description="Echo tool",
                    inputSchema={"type": "object", "properties": {}},
                )
            ]
        )

    async def send_ping(self):
        self.pings += 1


class MCPClientLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        StubSSEContext.opened = 0
        StubSSEContext.closed = 0
        StubClientSession.closed = 0
        self._orig_sse_client = mcp_client_module.sse_client
        self._orig_client_session = mcp_client_module.ClientSession
        mcp_client_module.sse_client = StubSSEContext
        mcp_client_module.ClientSession = StubClientSession
        self._orig_keep_alive = mcp_client_module.MCPClient._keep_alive

        async def _test_keep_alive(self) -> None:
            while not self._shutdown:
                await asyncio.sleep(0)

        mcp_client_module.MCPClient._keep_alive = _test_keep_alive

    async def asyncTearDown(self) -> None:
        mcp_client_module.sse_client = self._orig_sse_client
        mcp_client_module.ClientSession = self._orig_client_session
        mcp_client_module.MCPClient._keep_alive = self._orig_keep_alive

    async def test_stop_clears_connection_and_available_tools(self) -> None:
        client = MCPClient("http://localhost")
        connect_task = asyncio.create_task(client.connect_to_server(retry_delay=0))

        try:
            await self._wait_until_connected(client)
            await client.stop()
            await asyncio.wait_for(connect_task, timeout=0.2)
        finally:
            if not connect_task.done():
                connect_task.cancel()
                with suppress(asyncio.CancelledError):
                    await connect_task

        self.assertTrue(client._shutdown)
        self.assertIsNone(client.session)
        self.assertFalse(client._connected)
        self.assertEqual(client.available_tools, [])
        self.assertGreaterEqual(StubSSEContext.closed, 1)
        self.assertGreaterEqual(StubClientSession.closed, 1)

    async def _wait_until_connected(self, client: MCPClient) -> None:
        for _ in range(50):
            if client._connected:
                return
            await asyncio.sleep(0)
        self.fail("MCPClient did not connect during test")


if __name__ == "__main__":
    unittest.main()
