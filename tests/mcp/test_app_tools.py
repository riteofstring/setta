from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context

from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.tools.app_tools import stream_app_definition


def _build_ctx() -> Context:
    state = SimpleNamespace(
        deployment_mode=False,
        wmh_frontend_sender=SimpleNamespace(),
        project_manager_switcher=SimpleNamespace(main=SimpleNamespace()),
    )
    return Context(fastmcp=SimpleNamespace(state=state))


@pytest.mark.asyncio
async def test_stream_app_definition_rejects_malformed_patch_lines() -> None:
    with pytest.raises(InvalidToolArgumentsError, match="Invalid patches payload"):
        await stream_app_definition(
            patches='{"op":"set","path":"/not-allowed","value":1}',
            baseAppSpec={},
            ctx=_build_ctx(),
        )


@pytest.mark.asyncio
async def test_stream_app_definition_rejects_invalid_patch_application() -> None:
    with pytest.raises(InvalidToolArgumentsError, match="Invalid patches payload"):
        await stream_app_definition(
            patches='{"op":"set","path":"/elements/missing/props/title","value":"Hello"}',
            baseAppSpec={},
            ctx=_build_ctx(),
        )
