from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext

from setta.mcp import run_start_authorization


def _build_context(*, request_id: int, session: object) -> Context:
    request_context = RequestContext(
        request_id=request_id,
        meta=None,
        session=session,
        lifespan_context=object(),
    )
    return Context(
        fastmcp=SimpleNamespace(state=SimpleNamespace()),
        request_context=request_context,
    )


@pytest.mark.asyncio
async def test_pending_run_start_authorizations_are_isolated_per_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = type("_NativeMCPToolSession", (), {})()
    ctx_a = _build_context(request_id=1, session=session)
    ctx_b = _build_context(request_id=2, session=session)
    authorization_a = run_start_authorization.MCPRunStartAuthorization(
        share_session_id="share-session-a",
        reserved_single_run=False,
    )
    authorization_b = run_start_authorization.MCPRunStartAuthorization(
        share_session_id="share-session-b",
        reserved_single_run=True,
    )
    committed: list[tuple[int, run_start_authorization.MCPRunStartAuthorization]] = []
    rolled_back: list[tuple[int, run_start_authorization.MCPRunStartAuthorization]] = []

    async def fake_authorize_mcp_run_start(
        ctx: Context,
    ) -> run_start_authorization.MCPRunStartAuthorization:
        if ctx.request_context.request_id == 1:
            return authorization_a
        return authorization_b

    def fake_commit_mcp_run_start(
        ctx: Context,
        authorization: run_start_authorization.MCPRunStartAuthorization,
    ) -> None:
        committed.append((ctx.request_context.request_id, authorization))

    async def fake_rollback_mcp_run_start(
        ctx: Context,
        authorization: run_start_authorization.MCPRunStartAuthorization,
    ) -> None:
        rolled_back.append((ctx.request_context.request_id, authorization))

    monkeypatch.setattr(
        run_start_authorization,
        "authorize_mcp_run_start",
        fake_authorize_mcp_run_start,
    )
    monkeypatch.setattr(
        run_start_authorization,
        "commit_mcp_run_start",
        fake_commit_mcp_run_start,
    )
    monkeypatch.setattr(
        run_start_authorization,
        "rollback_mcp_run_start",
        fake_rollback_mcp_run_start,
    )

    await run_start_authorization.authorize_pending_mcp_run_start(ctx_a)
    await run_start_authorization.authorize_pending_mcp_run_start(ctx_b)

    assert run_start_authorization.has_pending_mcp_run_start_authorization(ctx_a)
    assert run_start_authorization.has_pending_mcp_run_start_authorization(ctx_b)

    run_start_authorization.commit_pending_mcp_run_start(ctx_a)

    assert committed == [(1, authorization_a)]
    assert not run_start_authorization.has_pending_mcp_run_start_authorization(ctx_a)
    assert run_start_authorization.has_pending_mcp_run_start_authorization(ctx_b)

    await run_start_authorization.rollback_pending_mcp_run_start(ctx_b)

    assert rolled_back == [(2, authorization_b)]
    assert not run_start_authorization.has_pending_mcp_run_start_authorization(ctx_b)
    assert not hasattr(session, "_pending_mcp_run_start_authorizations")
