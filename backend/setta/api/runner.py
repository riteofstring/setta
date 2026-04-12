import itertools
import random
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import requests

from setta.api.runtime_compat import verify_running_backend_compatibility
from setta.auth.bootstrap import origin_from_backend_url, select_auth_cookie_name
from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.sdk_contracts.generated import (
    RunnerSummarySection,
    RunnerSummarySnapshot,
    RunningBackendVersionHandshake,
)
from setta.sessions.registry import SessionMetadata, SessionRegistry
from setta.sessions.utils import resolve_sessions_root
from setta.types.generated.go_shared_constants import SESSION_MATCH_HOST_REWRITES
from setta.types.generated.go_shared_types import (
    DependencyKeyType,
    DetachedRun,
    ProjectConfig,
    Route,
    RunSnapshotMode,
)
from setta.types.id import ID
from setta.types.protocol import SectionParamDependencyKey
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths


@dataclass(slots=True)
class VariantLookup:
    _variants_by_name: dict[str, ID]

    def by_name(self, names: list[str]) -> list[ID]:
        missing = [name for name in names if name not in self._variants_by_name]
        if missing:
            raise KeyError(f"Unknown variant names: {missing}")
        return [self._variants_by_name[name] for name in names]


@dataclass(slots=True)
class SectionSummary:
    id: ID
    name: str
    variants: VariantLookup


class ParamLookup:
    def __init__(
        self,
        summary_snapshot: RunnerSummarySnapshot,
        section_name_map: dict[str, ID],
    ) -> None:
        self._sections_by_id = {
            ID(section.id): section for section in summary_snapshot.sections
        }
        self._section_name_map = section_name_map

    def by_name(self, section_name: str, param_name: str) -> SectionParamDependencyKey:
        section_id = self._section_name_map.get(section_name, section_name)
        section = self._sections_by_id.get(ID(section_id))
        if section is None:
            raise KeyError(f"Unknown section: {section_name}")
        if not section.supportsParams:
            raise KeyError(f"Section {section_name!r} has no params")
        for param in section.params:
            if param_name in (param.name, param.displayName):
                return SectionParamDependencyKey(
                    type=DependencyKeyType.SectionParam,
                    sectionId=ID(section.id),
                    codeObjId=ID(param.id),
                )
        raise KeyError(
            f"Unknown param name {param_name!r} for section {section_name!r}"
        )


class RunnerSummary:
    def __init__(self, summary_snapshot: RunnerSummarySnapshot) -> None:
        self._sections_by_id: dict[ID, RunnerSummarySection] = {
            ID(section.id): section for section in summary_snapshot.sections
        }
        self._section_name_map: dict[str, ID] = {}
        for section in summary_snapshot.sections:
            section_id = ID(section.id)
            self._section_name_map[section.name] = section_id
            if section.displayName:
                self._section_name_map[section.displayName] = section_id
        self.params = ParamLookup(summary_snapshot, self._section_name_map)

    def section(self, name_or_id: str) -> SectionSummary:
        section_id = self._section_name_map.get(name_or_id, name_or_id)
        section = self._sections_by_id.get(ID(section_id))
        if section is None:
            raise KeyError(f"Unknown section: {name_or_id}")
        variants_by_name: dict[str, ID] = {}
        for variant in section.variants:
            variants_by_name[variant.name] = ID(variant.id)
        return SectionSummary(
            id=ID(section.id),
            name=section.name,
            variants=VariantLookup(variants_by_name),
        )


@dataclass(slots=True)
class RunOverride:
    project_config_ref: str | None = None
    entry_section_id: ID | None = None
    run_snapshot_mode: RunSnapshotMode | None = None
    section_variant_overrides: dict[ID, ID] = field(default_factory=dict)
    param_overrides: dict[SectionParamDependencyKey | tuple[ID, ID], str] = field(
        default_factory=dict
    )
    tags: dict[str, str] = field(default_factory=dict)

    def copy(self) -> "RunOverride":
        return RunOverride(
            project_config_ref=self.project_config_ref,
            entry_section_id=self.entry_section_id,
            run_snapshot_mode=self.run_snapshot_mode,
            section_variant_overrides=dict(self.section_variant_overrides),
            param_overrides=dict(self.param_overrides),
            tags=dict(self.tags),
        )


def _normalize_param_key(key: object) -> tuple[ID, ID]:
    if isinstance(key, SectionParamDependencyKey):
        return key.sectionId, key.codeObjId
    if isinstance(key, tuple) and len(key) == 2:
        section_id, param_id = key
        return section_id, param_id
    raise ValueError(f"Unsupported param override key: {key!r}")


def _normalize_backend_host(host: str | None) -> str | None:
    if host is None:
        return None
    cleaned = host.strip()
    if cleaned.startswith("[") and cleaned.endswith("]"):
        cleaned = cleaned[1:-1]
    return SESSION_MATCH_HOST_REWRITES.get(cleaned.lower(), cleaned)


def _build_cookie_headers(cookie_name: str, cookie_value: str) -> dict[str, str]:
    return {"Cookie": f"{cookie_name}={cookie_value}"}


def _build_session_cookie_headers(session_id: str, secret: bytes) -> dict[str, str]:
    cookie_value = AUTH_COOKIE_MANAGER.mint(session_id, secret)
    return _build_cookie_headers(auth_cookie_name(session_id), cookie_value)


def _bootstrap_cookie_headers(cookie_map: dict[str, str]) -> dict[str, str]:
    cookie_name = select_auth_cookie_name(list(cookie_map.keys()))
    if not cookie_name:
        raise ValueError("Bootstrap response did not include auth cookie.")
    cookie_value = cookie_map.get(cookie_name)
    if not cookie_value:
        raise ValueError("Bootstrap response did not include auth cookie.")
    return _build_cookie_headers(cookie_name, cookie_value)


def _normalize_param_grid(
    param_grid: dict[object, list[object]],
) -> tuple[list[tuple[ID, ID]], list[list[object]]]:
    return [_normalize_param_key(key) for key in param_grid.keys()], list(
        param_grid.values()
    )


def _copy_run_override_with_params(
    override: RunOverride,
    keys: list[tuple[ID, ID]],
    values: Iterable[object],
) -> RunOverride:
    next_override = override.copy()
    next_override.param_overrides.update(
        {key: str(value) for key, value in zip(keys, values)}
    )
    return next_override


def _build_project_config_lookup(configs: list[ProjectConfig]) -> dict[str, ID]:
    lookup: dict[str, ID] = {}
    for config in configs:
        lookup[str(config.id)] = config.id
        lookup.setdefault(config.name, config.id)
    return lookup


class RunPlan:
    def __init__(self, overrides: list[RunOverride] | None = None) -> None:
        self._overrides = overrides or [RunOverride()]

    def __iter__(self):
        return iter(self._overrides)

    def __len__(self) -> int:
        return len(self._overrides)

    def for_project_configs(self, configs: list[str]) -> "RunPlan":
        overrides = [RunOverride(project_config_ref=config) for config in configs]
        return RunPlan(overrides)

    def loop_section_variants(
        self,
        *,
        section_id: ID,
        variant_ids: list[ID],
    ) -> "RunPlan":
        expanded: list[RunOverride] = []
        for override in self._overrides:
            for variant_id in variant_ids:
                next_override = override.copy()
                next_override.section_variant_overrides[section_id] = variant_id
                expanded.append(next_override)
        return RunPlan(expanded)

    def grid_params(self, param_grid: dict[object, list[object]]) -> "RunPlan":
        if not param_grid:
            return RunPlan(self._copy_overrides())
        keys, value_lists = _normalize_param_grid(param_grid)
        return self._expand_param_rows(
            keys,
            lambda: itertools.product(*value_lists),
        )

    def zip_params(self, param_grid: dict[object, list[object]]) -> "RunPlan":
        if not param_grid:
            return RunPlan(self._copy_overrides())
        keys, value_lists = _normalize_param_grid(param_grid)
        lengths = {len(values) for values in value_lists}
        if len(lengths) > 1:
            raise ValueError(
                "zip_params requires all value lists to have the same length"
            )
        return self._expand_param_rows(keys, lambda: zip(*value_lists))

    def random_params(
        self,
        param_grid: dict[object, list[object]],
        *,
        count: int,
        seed: int | None = None,
    ) -> "RunPlan":
        if not param_grid:
            return RunPlan(self._copy_overrides())
        rng = random.Random(seed)
        keys, value_lists = _normalize_param_grid(param_grid)
        return self._expand_param_rows(
            keys,
            lambda: (
                tuple(rng.choice(values) for values in value_lists)
                for _ in range(count)
            ),
        )

    def repeat(self, count: int) -> "RunPlan":
        if count < 1:
            raise ValueError("repeat requires count >= 1")
        expanded: list[RunOverride] = []
        for _ in range(count):
            expanded.extend(override.copy() for override in self._overrides)
        return RunPlan(expanded)

    def _copy_overrides(self) -> list[RunOverride]:
        return [override.copy() for override in self._overrides]

    def _expand_param_rows(
        self,
        keys: list[tuple[ID, ID]],
        value_rows_factory: Callable[[], Iterable[tuple[object, ...]]],
    ) -> "RunPlan":
        expanded: list[RunOverride] = []
        for override in self._overrides:
            expanded.extend(
                _copy_run_override_with_params(override, keys, values)
                for values in value_rows_factory()
            )
        return RunPlan(expanded)


class SettaRunner:
    def __init__(
        self,
        *,
        project_name: str | None = None,
        project_config_id: ID | None = None,
        base_url: str | None = None,
        auth_headers: dict[str, str] | None = None,
        bootstrap_token: str | None = None,
        workspace_root: Path | str | None = None,
    ) -> None:
        self._project_name = project_name
        self._project_config_id = project_config_id
        self._base_url = (base_url or C.BACKEND).rstrip("/")
        self._session = requests.Session()
        self._auth_headers = dict(auth_headers) if auth_headers is not None else None
        self._bootstrap_token = bootstrap_token.strip() if bootstrap_token else None
        if workspace_root is None:
            self._workspace_root = get_setta_paths().workspace_root
        elif isinstance(workspace_root, Path):
            self._workspace_root = workspace_root.expanduser().resolve()
        else:
            self._workspace_root = Path(workspace_root).expanduser().resolve()
        self._resolved_auth_headers: dict[str, str] | None = None
        self._project_configs: list[ProjectConfig] | None = None
        self._project_config_ids_by_ref: dict[str, ID] | None = None
        self._default_project_config_id: ID | None = None
        self._verified_runtime_handshake: RunningBackendVersionHandshake | None = None

    def summary(self) -> RunnerSummary:
        project_config_id = self._resolve_project_config_id(None)
        data = self._post(
            Route.GET_RUNNER_SUMMARY, {"projectConfigId": project_config_id}
        )
        summary_snapshot = RunnerSummarySnapshot(**data)
        return RunnerSummary(summary_snapshot)

    def run_detached(
        self,
        override: RunOverride | None = None,
        *,
        entry_section: str | ID | None = None,
    ) -> DetachedRun:
        active_override = override.copy() if override is not None else RunOverride()
        if active_override.run_snapshot_mode == RunSnapshotMode.never:
            raise ValueError(
                "Detached runs always snapshot; runSnapshotMode=never is not supported."
            )
        project_config_id = self._resolve_project_config_id(
            active_override.project_config_ref
        )
        entry_section_id = active_override.entry_section_id
        if entry_section is not None:
            entry_section_id = self.summary().section(str(entry_section)).id
        payload = {
            "projectConfigId": project_config_id,
            "entrySectionId": entry_section_id,
            "runSnapshotMode": active_override.run_snapshot_mode,
            "sectionVariantOverrides": active_override.section_variant_overrides,
            "paramOverrides": {
                f"{section_id}:{param_id}": value
                for key, value in active_override.param_overrides.items()
                for section_id, param_id in [_normalize_param_key(key)]
            },
            "tags": active_override.tags,
        }
        data = self._post(Route.RUN_DETACHED, payload)
        return DetachedRun(**data)

    def get_run_status(self, run_id: str) -> DetachedRun:
        data = self._post(Route.GET_RUN_STATUS, {"runId": run_id})
        return DetachedRun(**data)

    def cancel_run(self, run_id: str) -> DetachedRun:
        data = self._post(Route.CANCEL_RUN, {"runId": run_id})
        return DetachedRun(**data)

    def _post(self, route: Route, payload: dict) -> dict:
        if self._resolved_auth_headers is None:
            headers = self._resolve_auth_headers()
            self._session.headers.update(headers)
            self._resolved_auth_headers = headers
        self._ensure_runtime_compatibility()
        url = f"{self._base_url}{Route.API_PREFIX.value}{route.value}"
        response = self._session.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    def _ensure_runtime_compatibility(self) -> None:
        if self._verified_runtime_handshake is not None:
            return
        self._verified_runtime_handshake = verify_running_backend_compatibility(
            self._session,
            base_url=self._base_url,
            auth_headers=None,
        )

    def _resolve_auth_headers(self) -> dict[str, str]:
        if self._auth_headers is not None:
            return dict(self._auth_headers)
        for resolver in (
            self._resolve_bootstrap_auth_headers,
            self._resolve_current_session_auth_headers,
            self._resolve_workspace_session_auth_headers,
        ):
            headers = resolver()
            if headers is not None:
                return headers
        raise ValueError(
            "Missing Setta auth. Provide auth_headers or bootstrap_token, or set "
            "SETTA_SESSION_ID (and SETTA_SESSIONS_ROOT if running outside the session "
            "workspace)."
        )

    def _resolve_bootstrap_auth_headers(self) -> dict[str, str] | None:
        if self._bootstrap_token is None:
            return None
        origin = origin_from_backend_url(self._base_url)
        consume_url = f"{origin}{Route.BOOTSTRAP_CONSUME.value}"
        response = self._session.post(
            consume_url,
            json={"token": self._bootstrap_token},
        )
        response.raise_for_status()
        return _bootstrap_cookie_headers(response.cookies.get_dict())

    def _resolve_current_session_auth_headers(self) -> dict[str, str] | None:
        session_info = load_current_session_secret()
        if session_info is None:
            return None
        session_metadata, secret = session_info
        return _build_session_cookie_headers(session_metadata.id, secret)

    def _resolve_workspace_session_auth_headers(self) -> dict[str, str] | None:
        sessions_root = resolve_sessions_root(self._workspace_root)
        if sessions_root is None:
            return None
        registry = SessionRegistry(sessions_root=sessions_root)
        sessions = registry.find_sessions_by_workspace(self._workspace_root)
        if not sessions:
            return None
        selected = self._select_workspace_session(sessions)
        secret_path = registry.resolve_secret_path(selected)
        if not secret_path.exists():
            return None
        return _build_session_cookie_headers(selected.id, secret_path.read_bytes())

    def _select_workspace_session(
        self, sessions: list[SessionMetadata]
    ) -> SessionMetadata:
        matching_sessions = self._matching_workspace_sessions(sessions)
        if matching_sessions:
            sessions = matching_sessions
        sessions.sort(key=lambda session: session.startedAt, reverse=True)
        return sessions[0]

    def _matching_workspace_sessions(
        self, sessions: list[SessionMetadata]
    ) -> list[SessionMetadata]:
        parsed_base_url = urlparse(self._base_url)
        base_host = _normalize_backend_host(parsed_base_url.hostname)
        base_port = parsed_base_url.port
        if base_host is None and base_port is None:
            return []
        return [
            session
            for session in sessions
            if (base_port is None or session.port == base_port)
            and (
                base_host is None or _normalize_backend_host(session.host) == base_host
            )
        ]

    def _resolve_project_config_id(self, ref: str | None) -> ID:
        project_ref = ref or self._project_name
        if project_ref is None:
            return self._resolve_default_project_config_id()
        project_config_id = self._project_config_lookup().get(str(project_ref))
        if project_config_id is not None:
            return project_config_id
        raise KeyError(f"Unknown project config: {project_ref}")

    def _resolve_default_project_config_id(self) -> ID:
        if self._project_config_id is not None:
            return self._project_config_id
        self._load_project_metadata()
        if self._default_project_config_id is None:
            raise KeyError("No default project config available")
        return self._default_project_config_id

    def _project_config_lookup(self) -> dict[str, ID]:
        if self._project_config_ids_by_ref is None:
            self._project_config_ids_by_ref = _build_project_config_lookup(
                self._load_project_metadata()
            )
        return self._project_config_ids_by_ref

    def _load_project_metadata(self) -> list[ProjectConfig]:
        if self._project_configs is not None:
            return self._project_configs
        data = self._post(Route.LOAD_ALL_PROJECT_METADATA, {})
        self._default_project_config_id = data.get("defaultProjectConfigId")
        self._project_configs = [
            ProjectConfig(**item) for item in data.get("projectMetadata", [])
        ]
        self._project_config_ids_by_ref = _build_project_config_lookup(
            self._project_configs
        )
        return self._project_configs
