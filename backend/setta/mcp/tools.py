from .server import mcp_server


@mcp_server.tool(
    description="creates an empty section in a pre-determined location, with a randomly created name"
)
async def add_regular_section_in_empty_space():
    return await mcp_server.setta_websocket.use_frontend_tool(
        "addRegularSectionInEmptySpace"
    )


@mcp_server.tool()
def add_two_numbers(a: int, b: int):
    return a + b
