import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
import requests
import setta.api.runner as runner_mod
from setta.api.runner import RunOverride, RunPlan, SettaRunner
from setta.auth.cookies import auth_cookie_name
from setta.sdk_contracts.generated import (
    RunnerSummaryParam,
    RunnerSummarySection,
    RunnerSummarySnapshot,
    RunnerSummaryVariant,
)
from setta.sessions.constants import IN_PROCESS_ENV_VAR
from setta.sessions.registry import SessionRegistry
from setta.sessions.utils import resolve_sessions_root
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.utils.constants import C


def _build_project_summary_snapshot() -> RunnerSummarySnapshot:
    return RunnerSummarySnapshot(
        projectConfigId="project-1",
        sections=[
            RunnerSummarySection(
                id="section-welcome",
                name="Welcome",
                supportsParams=False,
                variants=[
                    RunnerSummaryVariant(
                        id="section-variant",
                        name="Welcome Variant",
                    )
                ],
            )
        ],
    )


def _build_summary_lookup_snapshot() -> RunnerSummarySnapshot:
    return RunnerSummarySnapshot(
        projectConfigId="project-1",
        sections=[
            RunnerSummarySection(
                id="training-section",
                name="Training",
                displayName="Training Settings",
                supportsParams=True,
                variants=[
                    RunnerSummaryVariant(
                        id="training-variant-base",
                        name="Baseline",
                    ),
                    RunnerSummaryVariant(
                        id="training-variant-accurate",
                        name="High Accuracy",
                    ),
                ],
                params=[
                    RunnerSummaryParam(
                        id="lr-param",
                        name="learning_rate",
                        displayName="Learning Rate",
                    ),
                    RunnerSummaryParam(
                        id="training-root",
                        name="training_root",
                        displayName="Training Root",
                    ),
                ],
            ),
            RunnerSummarySection(
                id="notes-section",
                name="Notes",
                displayName="Overview Notes",
                supportsParams=False,
                variants=[
                    RunnerSummaryVariant(
                        id="notes-variant",
                        name="Notes Variant",
                    )
                ],
            ),
        ],
    )


def test_random_params_empty_grid_returns_identity() -> None:
    base_override = RunOverride(tags={"kind": "base"})
    plan = RunPlan([base_override])

    expanded = plan.random_params({}, count=3)

    assert len(expanded) == 1
    overrides = list(expanded)
    assert overrides[0].tags == {"kind": "base"}


def test_resolve_project_config_id_matches_name_and_id() -> None:
    runner = SettaRunner(base_url="http://example.com")
    config = ProjectConfig(name="Alpha")
    runner._project_configs = [config]
    runner._default_project_config_id = config.id

    assert runner._resolve_project_config_id("Alpha") == config.id
    assert runner._resolve_project_config_id(str(config.id)) == config.id


def test_resolve_project_config_id_raises_on_unknown() -> None:
    runner = SettaRunner(base_url="http://example.com")
    config = ProjectConfig(name="Alpha")
    runner._project_configs = [config]
    runner._default_project_config_id = config.id

    with pytest.raises(KeyError):
        runner._resolve_project_config_id("Missing")


def test_summary_loads_latest_project_state_for_default_config(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com")
    summary_snapshot = _build_project_summary_snapshot()
    observed_requests: list[tuple[runner_mod.Route, dict]] = []

    def post(route: runner_mod.Route, payload: dict) -> dict:
        observed_requests.append((route, payload))
        return summary_snapshot.model_dump(mode="json")

    monkeypatch.setattr(runner, "_post", post)
    monkeypatch.setattr(
        runner,
        "_resolve_project_config_id",
        lambda _ref: ID(summary_snapshot.projectConfigId),
    )

    # Runner summary should fetch the narrow Go-owned runner snapshot for the
    # resolved default project config and expose that through RunnerSummary.
    summary = runner.summary()

    assert summary.section("Welcome").id == ID("section-welcome")
    assert observed_requests == [
        (
            runner_mod.Route.GET_RUNNER_SUMMARY,
            {"projectConfigId": ID(summary_snapshot.projectConfigId)},
        )
    ]


def test_summary_section_lookup_accepts_display_names_and_variant_names(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com")
    summary_snapshot = _build_summary_lookup_snapshot()

    monkeypatch.setattr(
        runner,
        "_post",
        lambda _route, _payload: summary_snapshot.model_dump(mode="json"),
    )
    monkeypatch.setattr(
        runner,
        "_resolve_project_config_id",
        lambda _ref: ID(summary_snapshot.projectConfigId),
    )

    # Runner summary should resolve the same section by core name, display name,
    # or canonical id, and variant lookup should keep user-facing names stable.
    summary = runner.summary()

    assert summary.section("Training").id == ID("training-section")
    assert summary.section("Training Settings").id == ID("training-section")
    assert summary.section("training-section").id == ID("training-section")
    assert summary.section("Training Settings").variants.by_name(
        ["Baseline", "High Accuracy"]
    ) == [
        ID("training-variant-base"),
        ID("training-variant-accurate"),
    ]


def test_summary_params_by_name_accepts_display_names_and_fails_closed(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com")
    summary_snapshot = _build_summary_lookup_snapshot()

    monkeypatch.setattr(
        runner,
        "_post",
        lambda _route, _payload: summary_snapshot.model_dump(mode="json"),
    )
    monkeypatch.setattr(
        runner,
        "_resolve_project_config_id",
        lambda _ref: ID(summary_snapshot.projectConfigId),
    )

    # Param lookup should resolve both core and display names while rejecting
    # unknown params and sections that do not carry param-capable impls.
    summary = runner.summary()

    assert summary.params.by_name(
        "Training Settings", "learning_rate"
    ) == SectionParamDependencyKey(
        sectionId=ID("training-section"),
        codeObjId=ID("lr-param"),
    )
    assert summary.params.by_name(
        "Training Settings", "Learning Rate"
    ) == SectionParamDependencyKey(
        sectionId=ID("training-section"),
        codeObjId=ID("lr-param"),
    )
    with pytest.raises(KeyError, match="Unknown param name"):
        summary.params.by_name("Training Settings", "missing_param")
    with pytest.raises(KeyError, match="has no params"):
        summary.params.by_name("Overview Notes", "Learning Rate")


def test_resolve_auth_headers_loads_cookie_from_matching_workspace_session(
    tmp_path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    sessions_root = resolve_sessions_root(workspace_root)
    assert sessions_root is not None
    registry = SessionRegistry(sessions_root=sessions_root)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
    session = registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setattr(runner_mod, "load_current_session_secret", lambda: None)
    monkeypatch.setattr(
        runner_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda _session_id, _secret: "cookie-value",
    )

    # Runner auth should reuse the workspace session cookie when the base URL
    # targets the same local IDE session, even if the URL uses localhost.
    runner = SettaRunner(
        base_url="http://localhost:61234",
        workspace_root=workspace_root,
    )

    assert runner._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name(session.id)}=cookie-value"
    }


def test_resolve_auth_headers_prefers_matching_session_over_newer_workspace_session(
    tmp_path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    sessions_root = resolve_sessions_root(workspace_root)
    assert sessions_root is not None
    registry = SessionRegistry(sessions_root=sessions_root)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
    started_at = datetime.now(timezone.utc)
    matching = registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
        started_at=started_at,
    )
    registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=61235,
        pid=os.getpid(),
        started_at=started_at + timedelta(minutes=1),
    )
    monkeypatch.setattr(runner_mod, "load_current_session_secret", lambda: None)
    monkeypatch.setattr(
        runner_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda session_id, _secret: f"cookie-{session_id}",
    )

    # When a base URL matches one workspace session, runner auth should prefer
    # that session instead of the most recently started unrelated session.
    runner = SettaRunner(
        base_url="http://127.0.0.1:61234",
        workspace_root=workspace_root,
    )

    assert runner._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name(matching.id)}=cookie-{matching.id}"
    }


def test_post_resolves_auth_headers_once_and_reuses_session_headers(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com")
    resolve_calls = 0
    observed_headers: list[dict[str, str]] = []

    def resolve_auth_headers() -> dict[str, str]:
        nonlocal resolve_calls
        resolve_calls += 1
        return {"Cookie": "setta-auth=cached"}

    def post(url: str, json: dict) -> requests.Response:
        del json
        observed_headers.append(dict(runner._session.headers))
        response = requests.Response()
        response.status_code = 200
        response._content = b"{}"
        response.url = url
        return response

    monkeypatch.setattr(runner, "_resolve_auth_headers", resolve_auth_headers)
    monkeypatch.setattr(runner._session, "post", post)

    # Runner posts should resolve auth once, cache the result, and then reuse
    # the same session headers for later requests.
    runner._post(runner_mod.Route.GET_RUN_STATUS, {"runId": "run-1"})
    runner._post(runner_mod.Route.CANCEL_RUN, {"runId": "run-1"})

    assert resolve_calls == 1
    assert [headers["Cookie"] for headers in observed_headers] == [
        "setta-auth=cached",
        "setta-auth=cached",
    ]


def test_resolve_auth_headers_consumes_bootstrap_token(monkeypatch) -> None:
    runner = SettaRunner(
        base_url="http://127.0.0.1:8000",
        bootstrap_token="  bootstrap-token  ",
    )
    observed_requests: list[tuple[str, dict[str, str]]] = []

    def post(url: str, json: dict[str, str]) -> requests.Response:
        observed_requests.append((url, json))
        response = requests.Response()
        response.status_code = 200
        response.url = url
        response._content = b"{}"
        cookies = requests.cookies.RequestsCookieJar()
        cookies.set(auth_cookie_name("session-a"), "cookie-value")
        response.cookies = cookies
        return response

    monkeypatch.setattr(runner._session, "post", post)

    # Bootstrap auth should consume the trimmed token against the backend
    # bootstrap route and return the auth cookie header from that response.
    assert runner._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name('session-a')}=cookie-value"
    }
    assert observed_requests == [
        (
            f"http://127.0.0.1:8000{runner_mod.Route.BOOTSTRAP_CONSUME.value}",
            {"token": "bootstrap-token"},
        )
    ]


def test_resolve_auth_headers_uses_explicit_auth_headers_without_other_lookup(
    monkeypatch,
) -> None:
    runner = SettaRunner(
        base_url="http://127.0.0.1:8000",
        auth_headers={"Cookie": "explicit=value"},
        bootstrap_token="bootstrap-token",
    )

    def post(url: str, json: dict[str, str]) -> requests.Response:
        raise AssertionError(f"unexpected bootstrap request to {url} with {json}")

    monkeypatch.setattr(runner._session, "post", post)
    monkeypatch.setattr(
        runner_mod,
        "load_current_session_secret",
        lambda: (_ for _ in ()).throw(
            AssertionError("unexpected current session lookup")
        ),
    )
    monkeypatch.setattr(
        runner_mod,
        "resolve_sessions_root",
        lambda _root: (_ for _ in ()).throw(
            AssertionError("unexpected workspace session lookup")
        ),
    )

    # Explicit auth_headers should short-circuit bootstrap, current-session,
    # and workspace-session auth selection.
    assert runner._resolve_auth_headers() == {"Cookie": "explicit=value"}


def test_resolve_auth_headers_fails_closed_when_bootstrap_cookie_is_unusable(
    monkeypatch,
) -> None:
    runner = SettaRunner(
        base_url="http://127.0.0.1:8000",
        bootstrap_token="bootstrap-token",
    )

    def post(url: str, json: dict[str, str]) -> requests.Response:
        del json
        response = requests.Response()
        response.status_code = 200
        response.url = url
        response._content = b"{}"
        cookies = requests.cookies.RequestsCookieJar()
        cookies.set(C.AUTH_COOKIE_NAME, "base-cookie")
        response.cookies = cookies
        return response

    monkeypatch.setattr(runner._session, "post", post)
    monkeypatch.setattr(runner_mod, "load_current_session_secret", lambda: None)
    monkeypatch.setattr(runner_mod, "resolve_sessions_root", lambda _root: None)

    # A bootstrap response that omits a session-scoped auth cookie should
    # fail closed instead of falling back to the unsuffixed base cookie name.
    with pytest.raises(
        ValueError, match="Bootstrap response did not include auth cookie."
    ):
        runner._resolve_auth_headers()


def test_resolve_auth_headers_fails_closed_when_no_auth_source_resolves(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://127.0.0.1:8000")

    monkeypatch.setattr(runner_mod, "load_current_session_secret", lambda: None)
    monkeypatch.setattr(runner_mod, "resolve_sessions_root", lambda _root: None)

    # Without explicit headers, bootstrap auth, a current session, or a
    # matching workspace session, runner auth should refuse to fabricate a
    # header and surface the documented configuration error.
    with pytest.raises(ValueError, match="Missing Setta auth\\. Provide auth_headers"):
        runner._resolve_auth_headers()


def test_resolve_auth_headers_prefers_current_session_over_workspace_session(
    tmp_path, monkeypatch
) -> None:
    workspace_root = tmp_path / "workspace"
    workspace_root.mkdir()
    sessions_root = resolve_sessions_root(workspace_root)
    assert sessions_root is not None
    registry = SessionRegistry(sessions_root=sessions_root)
    monkeypatch.setenv(IN_PROCESS_ENV_VAR, "1")
    workspace_session = registry.create_session(
        workspace_path=workspace_root,
        host="127.0.0.1",
        port=61234,
        pid=os.getpid(),
    )
    monkeypatch.setattr(
        runner_mod,
        "load_current_session_secret",
        lambda: (SimpleNamespace(id="current-session"), b"current-secret"),
    )
    monkeypatch.setattr(
        runner_mod.AUTH_COOKIE_MANAGER,
        "mint",
        lambda session_id, _secret: f"cookie-{session_id}",
    )

    # Current-session auth should win before the runner falls back to matching
    # workspace sessions for the requested backend URL.
    runner = SettaRunner(
        base_url="http://127.0.0.1:61234",
        workspace_root=workspace_root,
    )

    assert runner._resolve_auth_headers() == {
        "Cookie": f"{auth_cookie_name('current-session')}=cookie-current-session"
    }
    assert workspace_session.id != "current-session"


def test_run_detached_resolves_entry_section_name_via_summary(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com", auth_headers={"Cookie": "x=y"})
    summary_snapshot = _build_project_summary_snapshot()
    observed_requests: list[tuple[runner_mod.Route, dict]] = []

    def post(route: runner_mod.Route, payload: dict) -> dict:
        observed_requests.append((route, payload))
        if route is runner_mod.Route.GET_RUNNER_SUMMARY:
            return summary_snapshot.model_dump(mode="json")
        if route is runner_mod.Route.RUN_DETACHED:
            return {"runId": "run-1", "status": "queued"}
        raise AssertionError(f"unexpected route {route}")

    monkeypatch.setattr(runner, "_post", post)
    monkeypatch.setattr(
        runner,
        "_resolve_project_config_id",
        lambda _ref: ID(summary_snapshot.projectConfigId),
    )

    # Detached runs should resolve an entry section name through RunnerSummary
    # and send the canonical section id in the detached-run payload.
    response = runner.run_detached(entry_section="Welcome")

    assert response.runId == "run-1"
    assert observed_requests == [
        (
            runner_mod.Route.GET_RUNNER_SUMMARY,
            {"projectConfigId": ID(summary_snapshot.projectConfigId)},
        ),
        (
            runner_mod.Route.RUN_DETACHED,
            {
                "projectConfigId": ID(summary_snapshot.projectConfigId),
                "entrySectionId": ID("section-welcome"),
                "runSnapshotMode": None,
                "sectionVariantOverrides": {},
                "paramOverrides": {},
                "tags": {},
            },
        ),
    ]


def test_run_detached_encodes_param_overrides_from_dependency_keys(
    monkeypatch,
) -> None:
    runner = SettaRunner(base_url="http://example.com", auth_headers={"Cookie": "x=y"})
    summary_snapshot = _build_project_summary_snapshot()
    observed_requests: list[tuple[runner_mod.Route, dict]] = []
    param_key = SectionParamDependencyKey(
        sectionId=ID("section-a"),
        codeObjId=ID("param-b"),
    )

    def post(route: runner_mod.Route, payload: dict) -> dict:
        observed_requests.append((route, payload))
        return {"runId": "run-1", "status": "queued"}

    monkeypatch.setattr(runner, "_post", post)
    monkeypatch.setattr(
        runner,
        "_resolve_project_config_id",
        lambda _ref: ID(summary_snapshot.projectConfigId),
    )

    # Detached runs should translate dependency-key param overrides into the
    # route payload format used by the backend.
    response = runner.run_detached(
        override=RunOverride(param_overrides={param_key: "2"})
    )

    assert response.runId == "run-1"
    assert observed_requests == [
        (
            runner_mod.Route.RUN_DETACHED,
            {
                "projectConfigId": ID(summary_snapshot.projectConfigId),
                "entrySectionId": None,
                "runSnapshotMode": None,
                "sectionVariantOverrides": {},
                "paramOverrides": {"section-a:param-b": "2"},
                "tags": {},
            },
        )
    ]
