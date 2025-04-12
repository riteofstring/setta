# some parts borrowed from https://github.com/tadata-org/fastapi_mcp/blob/main/fastapi_mcp/server.py

from fastapi import Request
from mcp.server.fastmcp import FastMCP
from mcp.server.sse import SseServerTransport

mcp_server = FastMCP("Setta MCP Server")
mcp_server.setta_websocket = None


def add_mcp_server_to_fastapi_server(app, mount_path):
    msg_path = f"{mount_path}/messages/"
    sse_transport = SseServerTransport(msg_path)

    async def handle_mcp_connection(request: Request):
        async with sse_transport.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await mcp_server._mcp_server.run(
                streams[0],
                streams[1],
                mcp_server._mcp_server.create_initialization_options(),
            )

    app.get(mount_path)(handle_mcp_connection)
    app.mount(msg_path, app=sse_transport.handle_post_message)

    mcp_server.setta_websocket = app.state.websocket_msg_handlers.mcp
