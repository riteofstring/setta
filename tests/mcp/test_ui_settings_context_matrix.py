from collections.abc import Callable
from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.server import Context
from mcp.shared.context import RequestContext

from setta.agentic.agentic_scope import AgenticContext
from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.ui_settings_context import (
    resolve_frontend_websocket_id_from_ctx,
    resolve_project_config_id_from_ctx,
    resolve_project_manager_from_ctx,
    resolve_section_id_from_ctx,
    resolve_share_session_id_from_ctx,
)
from setta.types.id import ID


class _RecordingProjectManagerSwitcher:
    def __init__(
        self,
        *,
        default_project_config_id: str = "default-project",
        share_default_project_config_id: str | None = "share-default-project",
        raise_value_error_for_share_default: bool = False,
    ) -> None:
        self.main = SimpleNamespace(
            project_state_backend=SimpleNamespace(
                defaultProjectConfigId=default_project_config_id
            )
        )
        self._share_default_project_config_id = share_default_project_config_id
        self._raise_value_error_for_share_default = raise_value_error_for_share_default
        self.calls: list[tuple[ID, str | None]] = []
        self.get_for_session_calls: list[str] = []

    def get(
        self,
        project_identifier: ID,
        *,
        share_session_id: str | None = None,
    ):
        self.calls.append((project_identifier, share_session_id))
        if share_session_id is not None and project_identifier == ID(
            "__share_session_default_project__"
        ):
            if self._raise_value_error_for_share_default:
                raise ValueError("Share scope is unavailable in this mode.")
            return SimpleNamespace(
                project_state_backend=SimpleNamespace(
                    defaultProjectConfigId=self._share_default_project_config_id
                )
            )
        return {
            "projectIdentifier": project_identifier,
            "shareSessionId": share_session_id,
        }

    def get_for_session(self, share_session_id: str):
        self.get_for_session_calls.append(share_session_id)
        return SimpleNamespace(
            project_state_backend=SimpleNamespace(
                defaultProjectConfigId=self._share_default_project_config_id
            )
        )


class _RecordingFrontendSender:
    def __init__(self) -> None:
        self._frontend_websocket_ids_by_token: dict[str, str] = {}

    def register_affinity(
        self,
        *,
        affinity_token: str,
        websocket_id: str,
    ) -> None:
        self._frontend_websocket_ids_by_token[affinity_token] = websocket_id

    def resolve_frontend_websocket_id_from_affinity_token(
        self,
        *,
        affinity_token: str,
        share_session_id: str | None = None,  # noqa: ARG002
    ) -> str | None:
        return self._frontend_websocket_ids_by_token.get(affinity_token)


def _build_ctx(
    *,
    request_meta: dict[str, object] | None = None,
    agentic_context: AgenticContext | None = None,
    share_session_resolver: Callable[[Context], object] | None = None,
    project_manager_switcher: _RecordingProjectManagerSwitcher | None = None,
    frontend_sender: _RecordingFrontendSender | None = None,
    deployment_mode: bool = False,
) -> Context:
    switcher = (
        project_manager_switcher
        if project_manager_switcher is not None
        else _RecordingProjectManagerSwitcher()
    )
    state = SimpleNamespace(
        project_manager_switcher=switcher,
        wmh_frontend_sender=(
            frontend_sender
            if frontend_sender is not None
            else _RecordingFrontendSender()
        ),
        deployment_mode=deployment_mode,
    )
    fastmcp = SimpleNamespace(state=state)
    if agentic_context is not None:
        fastmcp._resolve_agentic_context = lambda _ctx: agentic_context
    if share_session_resolver is not None:
        fastmcp._resolve_share_session_id = share_session_resolver
    if request_meta is None:
        return Context(fastmcp=fastmcp)
    request_context = RequestContext(
        request_id="test-request",
        meta=request_meta,
        session=object(),
        lifespan_context=object(),
        request=None,
    )
    return Context(fastmcp=fastmcp, request_context=request_context)


def _build_agentic_context(
    *,
    project_config_id: str,
    section_id: str | None = None,
    frontend_websocket_id: str | None = None,
) -> AgenticContext:
    return AgenticContext(
        project_config_id=ID(project_config_id),
        chat_id=ID("chat-test"),
        section_id=ID(section_id) if section_id is not None else None,
        frontend_websocket_id=frontend_websocket_id,
        allow_unscoped=True,
    )


@pytest.mark.parametrize(
    (
        "explicit_project_config_id",
        "agentic_project_config_id",
        "meta_project_config_id",
        "default_project_config_id",
        "expected_project_config_id",
        "expected_error",
    ),
    [
        (
            None,
            "project-agentic",
            "project-meta",
            "project-default",
            "project-agentic",
            None,
        ),
        (
            "project-explicit",
            None,
            "project-meta",
            "project-default",
            "project-explicit",
            None,
        ),
        (
            None,
            None,
            "project-meta",
            "project-default",
            "project-meta",
            None,
        ),
        (
            None,
            None,
            None,
            "project-default",
            "project-default",
            None,
        ),
        (
            "project-explicit",
            "project-agentic",
            "project-meta",
            "project-default",
            None,
            "does not match agentic context projectConfigId",
        ),
    ],
)
def test_resolve_project_config_id_matrix(
    explicit_project_config_id: str | None,
    agentic_project_config_id: str | None,
    meta_project_config_id: str | None,
    default_project_config_id: str,
    expected_project_config_id: str | None,
    expected_error: str | None,
) -> None:
    """Project scope must use one canonical precedence order across all tools."""

    switcher = _RecordingProjectManagerSwitcher(
        default_project_config_id=default_project_config_id
    )
    request_meta: dict[str, object] = {}
    if meta_project_config_id is not None:
        request_meta["projectConfigId"] = meta_project_config_id
    agentic_context = (
        _build_agentic_context(project_config_id=agentic_project_config_id)
        if agentic_project_config_id is not None
        else None
    )
    ctx = _build_ctx(
        request_meta=request_meta,
        agentic_context=agentic_context,
        project_manager_switcher=switcher,
    )

    if expected_error is not None:
        with pytest.raises(ValueError, match=expected_error):
            resolve_project_config_id_from_ctx(
                ctx=ctx,
                project_config_id=(
                    ID(explicit_project_config_id)
                    if explicit_project_config_id is not None
                    else None
                ),
            )
        return

    resolved_project_config_id = resolve_project_config_id_from_ctx(
        ctx=ctx,
        project_config_id=(
            ID(explicit_project_config_id)
            if explicit_project_config_id is not None
            else None
        ),
    )
    assert resolved_project_config_id == ID(expected_project_config_id)


@pytest.mark.parametrize(
    (
        "explicit_section_id",
        "agentic_section_id",
        "meta_section_id",
        "expected_section_id",
    ),
    [
        ("section-explicit", "section-agentic", "section-meta", "section-explicit"),
        (None, "section-agentic", "section-meta", "section-agentic"),
        (None, None, "section-meta", "section-meta"),
        (None, None, "\t", None),
        (None, None, None, None),
    ],
)
def test_resolve_section_id_matrix(
    explicit_section_id: str | None,
    agentic_section_id: str | None,
    meta_section_id: str | None,
    expected_section_id: str | None,
) -> None:
    """Right-pane reveal section selection must respect explicit > agentic > meta."""

    request_meta: dict[str, object] = {}
    if meta_section_id is not None:
        request_meta["sectionId"] = meta_section_id
    agentic_context = (
        _build_agentic_context(
            project_config_id="project-agentic",
            section_id=agentic_section_id,
        )
        if agentic_section_id is not None
        else None
    )
    ctx = _build_ctx(request_meta=request_meta, agentic_context=agentic_context)

    resolved_section_id = resolve_section_id_from_ctx(
        ctx=ctx,
        explicit_section_id=(
            ID(explicit_section_id) if explicit_section_id is not None else None
        ),
    )
    if expected_section_id is None:
        assert resolved_section_id is None
    else:
        assert resolved_section_id == ID(expected_section_id)


@pytest.mark.parametrize(
    (
        "agentic_frontend_websocket_id",
        "meta_frontend_websocket_id",
        "expected_frontend_websocket_id",
    ),
    [
        ("frontend-agentic", "frontend-meta", "frontend-agentic"),
        (None, "frontend-meta", "frontend-meta"),
        (None, None, None),
    ],
)
def test_resolve_frontend_websocket_id_matrix(
    agentic_frontend_websocket_id: str | None,
    meta_frontend_websocket_id: str | None,
    expected_frontend_websocket_id: str | None,
) -> None:
    """Reveal routing affinity must prefer agentic context when both are valid."""

    request_meta: dict[str, object] = {}
    if meta_frontend_websocket_id is not None:
        request_meta["frontendWebsocketId"] = meta_frontend_websocket_id
    frontend_sender = _RecordingFrontendSender()
    for candidate in [agentic_frontend_websocket_id, meta_frontend_websocket_id]:
        if isinstance(candidate, str) and candidate.strip() != "":
            frontend_sender.register_affinity(
                affinity_token=candidate.strip(),
                websocket_id=candidate.strip(),
            )
    agentic_context = _build_agentic_context(
        project_config_id="project-agentic",
        frontend_websocket_id=agentic_frontend_websocket_id,
    )
    ctx = _build_ctx(
        request_meta=request_meta,
        agentic_context=agentic_context,
        frontend_sender=frontend_sender,
    )

    assert resolve_frontend_websocket_id_from_ctx(ctx) == expected_frontend_websocket_id


@pytest.mark.parametrize(
    (
        "agentic_frontend_websocket_id",
        "meta_frontend_websocket_id",
    ),
    [
        ("   ", "frontend-meta"),
        (None, "\t"),
        (None, 123),
    ],
)
def test_resolve_frontend_websocket_id_rejects_malformed_values(
    agentic_frontend_websocket_id: str | None,
    meta_frontend_websocket_id: object | None,
) -> None:
    request_meta: dict[str, object] = {}
    if meta_frontend_websocket_id is not None:
        request_meta["frontendWebsocketId"] = meta_frontend_websocket_id
    ctx = _build_ctx(
        request_meta=request_meta,
        agentic_context=_build_agentic_context(
            project_config_id="project-agentic",
            frontend_websocket_id=agentic_frontend_websocket_id,
        ),
    )

    with pytest.raises(
        InvalidToolArgumentsError,
        match="frontendWebsocketId must be a non-empty string when provided.",
    ):
        resolve_frontend_websocket_id_from_ctx(ctx)


@pytest.mark.parametrize(
    (
        "agentic_frontend_websocket_id",
        "meta_frontend_websocket_id",
        "expected_frontend_websocket_id",
    ),
    [
        ("frontend-agentic", "frontend-meta", "frontend-agentic"),
        (None, "frontend-meta", None),
    ],
)
def test_resolve_frontend_websocket_id_uses_agentic_affinity_only_in_share_scope(
    agentic_frontend_websocket_id: str | None,
    meta_frontend_websocket_id: str | None,
    expected_frontend_websocket_id: str | None,
) -> None:
    """Share-scoped reveal routing must ignore request-meta affinity but honor agentic context."""

    request_meta: dict[str, object] = {"shareSessionId": "share-meta"}
    if meta_frontend_websocket_id is not None:
        request_meta["frontendWebsocketId"] = meta_frontend_websocket_id
    frontend_sender = _RecordingFrontendSender()
    for candidate in [agentic_frontend_websocket_id, meta_frontend_websocket_id]:
        if isinstance(candidate, str) and candidate.strip() != "":
            frontend_sender.register_affinity(
                affinity_token=candidate.strip(),
                websocket_id=candidate.strip(),
            )
    agentic_context = _build_agentic_context(
        project_config_id="project-agentic",
        frontend_websocket_id=agentic_frontend_websocket_id,
    )
    ctx = _build_ctx(
        request_meta=request_meta,
        agentic_context=agentic_context,
        share_session_resolver=lambda _ctx: "share-resolved",
        frontend_sender=frontend_sender,
    )

    assert resolve_frontend_websocket_id_from_ctx(ctx) == expected_frontend_websocket_id


@pytest.mark.parametrize(
    ("agentic_frontend_websocket_id", "meta_frontend_websocket_id"),
    [
        ("   ", "frontend-meta"),
        (None, "   "),
        (None, 456),
    ],
)
def test_resolve_frontend_websocket_id_rejects_malformed_values_in_share_scope(
    agentic_frontend_websocket_id: str | None,
    meta_frontend_websocket_id: object,
) -> None:
    request_meta: dict[str, object] = {"shareSessionId": "share-meta"}
    request_meta["frontendWebsocketId"] = meta_frontend_websocket_id
    ctx = _build_ctx(
        request_meta=request_meta,
        agentic_context=_build_agentic_context(
            project_config_id="project-agentic",
            frontend_websocket_id=agentic_frontend_websocket_id,
        ),
        share_session_resolver=lambda _ctx: "share-resolved",
    )

    with pytest.raises(
        InvalidToolArgumentsError,
        match="frontendWebsocketId must be a non-empty string when provided.",
    ):
        resolve_frontend_websocket_id_from_ctx(ctx)


@pytest.mark.parametrize(
    ("resolver_mode", "meta_share_session_id", "expected_share_session_id"),
    [
        ("resolved", "share-meta", "share-resolved"),
        ("resolved_empty", "share-meta", None),
        ("raises", "share-meta", None),
        ("missing", "share-meta", None),
        ("missing", "\t", None),
    ],
)
def test_resolve_share_session_id_matrix(
    resolver_mode: str,
    meta_share_session_id: str | None,
    expected_share_session_id: str | None,
) -> None:
    """Share session resolution must ignore request-meta fallback outside share mode."""

    def _resolved_share(_ctx: Context) -> object:
        return "share-resolved"

    def _resolved_empty(_ctx: Context) -> object:
        return "   "

    resolver: Callable[[Context], object] | None
    if resolver_mode == "resolved":
        resolver = _resolved_share
    elif resolver_mode == "resolved_empty":
        resolver = _resolved_empty
    elif resolver_mode == "raises":

        def _raises(_ctx: Context) -> object:
            raise ValueError("share session unavailable")

        resolver = _raises
    elif resolver_mode == "missing":
        resolver = None
    else:
        raise AssertionError(f"Unsupported resolver mode: {resolver_mode}")

    request_meta: dict[str, object] = {}
    if meta_share_session_id is not None:
        request_meta["shareSessionId"] = meta_share_session_id
    ctx = _build_ctx(request_meta=request_meta, share_session_resolver=resolver)

    assert resolve_share_session_id_from_ctx(ctx) == expected_share_session_id


def test_resolve_share_session_id_uses_meta_fallback_in_deployment_mode() -> None:
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        deployment_mode=True,
    )

    assert resolve_share_session_id_from_ctx(ctx) == "share-meta"


def test_resolve_project_manager_from_ctx_uses_resolved_share_session_id() -> None:
    """Project-manager lookup must receive the same share-session scope that reveal uses."""

    switcher = _RecordingProjectManagerSwitcher()
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        share_session_resolver=lambda _ctx: "share-resolved",
        project_manager_switcher=switcher,
    )

    resolved_manager = resolve_project_manager_from_ctx(
        ctx=ctx,
        project_config_id=ID("project-a"),
    )

    assert resolved_manager["projectIdentifier"] == ID("project-a")
    assert resolved_manager["shareSessionId"] == "share-resolved"
    assert switcher.calls == [(ID("project-a"), "share-resolved")]


def test_resolve_project_manager_from_ctx_ignores_meta_share_session_id_in_ide_mode() -> (
    None
):
    """IDE mode must not treat caller metadata as authoritative share scope."""

    switcher = _RecordingProjectManagerSwitcher()
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        project_manager_switcher=switcher,
    )

    resolved_manager = resolve_project_manager_from_ctx(
        ctx=ctx,
        project_config_id=ID("project-a"),
    )

    assert resolved_manager["projectIdentifier"] == ID("project-a")
    assert resolved_manager["shareSessionId"] is None
    assert switcher.calls == [(ID("project-a"), None)]


def test_resolve_project_manager_from_ctx_uses_meta_share_session_id_in_deployment_mode() -> (
    None
):
    switcher = _RecordingProjectManagerSwitcher()
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        project_manager_switcher=switcher,
        deployment_mode=True,
    )

    resolved_manager = resolve_project_manager_from_ctx(
        ctx=ctx,
        project_config_id=ID("project-a"),
    )

    assert resolved_manager["projectIdentifier"] == ID("project-a")
    assert resolved_manager["shareSessionId"] == "share-meta"
    assert switcher.calls == [(ID("project-a"), "share-meta")]


def test_resolve_project_config_id_uses_share_session_default_when_project_is_omitted() -> (
    None
):
    switcher = _RecordingProjectManagerSwitcher(
        default_project_config_id="main-default",
        share_default_project_config_id="share-default",
    )
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        share_session_resolver=lambda _ctx: "share-resolved",
        project_manager_switcher=switcher,
    )

    resolved_project_config_id = resolve_project_config_id_from_ctx(
        ctx=ctx,
        project_config_id=None,
    )

    assert resolved_project_config_id == ID("share-default")
    assert switcher.get_for_session_calls == []
    assert switcher.calls == [
        (ID("__share_session_default_project__"), "share-resolved")
    ]


def test_resolve_project_config_id_share_scope_without_default_project_fails_fast() -> (
    None
):
    switcher = _RecordingProjectManagerSwitcher(
        default_project_config_id="main-default",
        share_default_project_config_id=None,
    )
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        share_session_resolver=lambda _ctx: "share-resolved",
        project_manager_switcher=switcher,
    )

    with pytest.raises(
        KeyError,
        match="No default project config id is available for share session",
    ):
        resolve_project_config_id_from_ctx(
            ctx=ctx,
            project_config_id=None,
        )
    assert switcher.calls == [
        (ID("__share_session_default_project__"), "share-resolved")
    ]


def test_resolve_project_config_id_share_scope_value_error_maps_to_invalid_arguments() -> (
    None
):
    switcher = _RecordingProjectManagerSwitcher(
        default_project_config_id="main-default",
        share_default_project_config_id="share-default",
        raise_value_error_for_share_default=True,
    )
    ctx = _build_ctx(
        request_meta={"shareSessionId": "share-meta"},
        share_session_resolver=lambda _ctx: "share-resolved",
        project_manager_switcher=switcher,
    )

    with pytest.raises(
        InvalidToolArgumentsError,
        match="Share scope is unavailable in this mode.",
    ):
        resolve_project_config_id_from_ctx(
            ctx=ctx,
            project_config_id=None,
        )
