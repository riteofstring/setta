import itertools
import random
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import requests

from setta.auth.bootstrap import origin_from_backend_url, select_auth_cookie_name
from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.project_state.project_manager_types import (
    RunDetachedResponse,
    RunStatusResponse,
)
from setta.sessions.registry import SessionRegistry
from setta.sessions.utils import resolve_sessions_root
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.helpers_lvl1 import get_curr_effective_section_impl
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.routes import Route
from setta.types.section_impls import BaseSectionWithParamsImpl
from setta.types.settings_state import RunSnapshotMode
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
        project_state: ProjectStateSingleConfig,
        section_name_map: dict[str, ID],
    ) -> None:
        self._project_state = project_state
        self._section_name_map = section_name_map

    def by_name(self, section_name: str, param_name: str) -> SectionParamDependencyKey:
        section_id = self._section_name_map.get(section_name, section_name)
        if section_id not in self._project_state.sections:
            raise KeyError(f"Unknown section: {section_name}")
        section_impl = get_curr_effective_section_impl(self._project_state, section_id)
        if not isinstance(section_impl, BaseSectionWithParamsImpl):
            raise KeyError(f"Section {section_name!r} has no params")
        for param_id in section_impl.codeObjVariantMap.keys():
            core = self._project_state.codeObjs[param_id]
            if param_name in (core.name, core.displayName):
                return SectionParamDependencyKey(
                    sectionId=section_id,
                    codeObjId=param_id,
                )
        raise KeyError(
            f"Unknown param name {param_name!r} for section {section_name!r}"
        )


class RunnerSummary:
    def __init__(self, project_state: ProjectStateSingleConfig) -> None:
        self._project_state = project_state
        self._section_name_map: dict[str, ID] = {}
        for section_id, core in project_state.sections.items():
            self._section_name_map[core.name] = section_id
            if core.displayName:
                self._section_name_map[core.displayName] = section_id
        self.params = ParamLookup(project_state, self._section_name_map)

    def section(self, name_or_id: str) -> SectionSummary:
        section_id = self._section_name_map.get(name_or_id, name_or_id)
        if section_id not in self._project_state.sections:
            raise KeyError(f"Unknown section: {name_or_id}")
        core = self._project_state.sections[section_id]
        variants_by_name: dict[str, ID] = {}
        for variant_id in core.variants:
            variant = self._project_state.sectionVariants[variant_id]
            variants_by_name[variant.name] = variant_id
        return SectionSummary(
            id=section_id,
            name=core.name,
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
            return RunPlan([override.copy() for override in self._overrides])
        keys = [_normalize_param_key(key) for key in param_grid.keys()]
        value_lists = list(param_grid.values())
        expanded: list[RunOverride] = []
        for override in self._overrides:
            for values in itertools.product(*value_lists):
                next_override = override.copy()
                for key, value in zip(keys, values):
                    next_override.param_overrides[key] = str(value)
                expanded.append(next_override)
        return RunPlan(expanded)

    def zip_params(self, param_grid: dict[object, list[object]]) -> "RunPlan":
        if not param_grid:
            return RunPlan([override.copy() for override in self._overrides])
        keys = [_normalize_param_key(key) for key in param_grid.keys()]
        value_lists = list(param_grid.values())
        lengths = {len(values) for values in value_lists}
        if len(lengths) > 1:
            raise ValueError(
                "zip_params requires all value lists to have the same length"
            )
        expanded: list[RunOverride] = []
        for override in self._overrides:
            for values in zip(*value_lists):
                next_override = override.copy()
                for key, value in zip(keys, values):
                    next_override.param_overrides[key] = str(value)
                expanded.append(next_override)
        return RunPlan(expanded)

    def random_params(
        self,
        param_grid: dict[object, list[object]],
        *,
        count: int,
        seed: int | None = None,
    ) -> "RunPlan":
        if not param_grid:
            return RunPlan([override.copy() for override in self._overrides])
        rng = random.Random(seed)
        keys = [_normalize_param_key(key) for key in param_grid.keys()]
        value_lists = list(param_grid.values())
        expanded: list[RunOverride] = []
        for override in self._overrides:
            for _ in range(count):
                next_override = override.copy()
                for key, values in zip(keys, value_lists):
                    next_override.param_overrides[key] = str(rng.choice(values))
                expanded.append(next_override)
        return RunPlan(expanded)

    def repeat(self, count: int) -> "RunPlan":
        if count < 1:
            raise ValueError("repeat requires count >= 1")
        expanded: list[RunOverride] = []
        for _ in range(count):
            expanded.extend(override.copy() for override in self._overrides)
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
        self._default_project_config_id: ID | None = None

    def summary(self) -> RunnerSummary:
        project_state = self._get_project_state()
        return RunnerSummary(project_state)

    def run_detached(
        self,
        override: RunOverride | None = None,
        *,
        entry_section: str | ID | None = None,
    ) -> RunDetachedResponse:
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
            entry_section_id = self._resolve_section_id(entry_section)
        payload = {
            "projectConfigId": project_config_id,
            "entrySectionId": entry_section_id,
            "runSnapshotMode": active_override.run_snapshot_mode,
            "sectionVariantOverrides": active_override.section_variant_overrides,
            "paramOverrides": self._encode_param_overrides(
                active_override.param_overrides
            ),
            "tags": active_override.tags,
        }
        data = self._post(Route.RUN_DETACHED, payload)
        return RunDetachedResponse(**data)

    def get_run_status(self, run_id: str) -> RunStatusResponse:
        data = self._post(Route.GET_RUN_STATUS, {"runId": run_id})
        return RunStatusResponse(**data)

    def cancel_run(self, run_id: str) -> RunStatusResponse:
        data = self._post(Route.CANCEL_RUN, {"runId": run_id})
        return RunStatusResponse(**data)

    def _post(self, route: Route, payload: dict) -> dict:
        if self._resolved_auth_headers is None:
            headers = self._resolve_auth_headers()
            self._session.headers.update(headers)
            self._resolved_auth_headers = headers
        url = f"{self._base_url}{Route.PREFIX.value}{route.value}"
        response = self._session.post(url, json=payload)
        response.raise_for_status()
        return response.json()

    def _resolve_auth_headers(self) -> dict[str, str]:
        if self._auth_headers is not None:
            return dict(self._auth_headers)
        if self._bootstrap_token is not None:
            cookie_header = self._consume_bootstrap_token(self._bootstrap_token)
            return {"Cookie": cookie_header}
        session_info = load_current_session_secret()
        if session_info is not None:
            session_metadata, secret = session_info
            cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
            return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}
        cookie_header = self._load_cookie_from_sessions()
        if cookie_header is not None:
            return {"Cookie": cookie_header}
        raise ValueError(
            "Missing Setta auth. Provide auth_headers or bootstrap_token, or set "
            "SETTA_SESSION_ID (and SETTA_SESSIONS_ROOT if running outside the session "
            "workspace)."
        )

    def _consume_bootstrap_token(self, token: str) -> str:
        origin = origin_from_backend_url(self._base_url)
        consume_url = f"{origin}{Route.BOOTSTRAP_CONSUME.value}"
        response = self._session.post(consume_url, json={"token": token})
        response.raise_for_status()
        cookie_map = response.cookies.get_dict()
        cookie_names = list(cookie_map.keys())
        if not cookie_names:
            raise ValueError("Bootstrap response did not include auth cookie.")
        cookie_name = select_auth_cookie_name(cookie_names)
        if not cookie_name:
            raise ValueError("Bootstrap response did not include auth cookie.")
        cookie_value = cookie_map.get(cookie_name)
        if not cookie_value:
            raise ValueError("Bootstrap response did not include auth cookie.")
        return f"{cookie_name}={cookie_value}"

    def _load_cookie_from_sessions(self) -> str | None:
        def normalize_host(host: str | None) -> str | None:
            if host is None:
                return None
            cleaned = host.strip()
            if cleaned.startswith("[") and cleaned.endswith("]"):
                cleaned = cleaned[1:-1]
            if cleaned == "0.0.0.0" or cleaned == "localhost":
                return "127.0.0.1"
            if cleaned == "::":
                return "::1"
            return cleaned

        sessions_root = resolve_sessions_root(self._workspace_root)
        if sessions_root is None:
            return None
        registry = SessionRegistry(sessions_root=sessions_root)
        sessions = registry.find_sessions_by_workspace(self._workspace_root)
        if not sessions:
            return None
        parsed_base_url = urlparse(self._base_url)
        base_host = normalize_host(parsed_base_url.hostname)
        base_port = parsed_base_url.port
        if base_host is not None or base_port is not None:
            matching = [
                session
                for session in sessions
                if (
                    (base_port is None or session.port == base_port)
                    and (
                        base_host is None
                        or normalize_host(session.host) == base_host
                    )
                )
            ]
            if matching:
                sessions = matching
        sessions.sort(key=lambda session: session.startedAt, reverse=True)
        selected = sessions[0]
        secret_path = registry.resolve_secret_path(selected)
        if not secret_path.exists():
            return None
        secret = secret_path.read_bytes()
        token = AUTH_COOKIE_MANAGER.mint(selected.id, secret)
        return f"{auth_cookie_name(selected.id)}={token}"

    def _get_project_state(self) -> ProjectStateSingleConfig:
        project_config_id = self._resolve_project_config_id(None)
        data = self._post(
            Route.GET_LATEST_PROJECT_STATE,
            {"projectConfigId": project_config_id},
        )
        return ProjectStateSingleConfig(**data["projectState"])

    def _resolve_project_config_id(self, ref: str | None) -> ID:
        project_name = ref or self._project_name
        if project_name is None:
            if self._project_config_id is not None:
                return self._project_config_id
            configs = self._load_project_metadata()
            if self._default_project_config_id is None:
                raise KeyError("No default project config available")
            return self._default_project_config_id
        configs = self._load_project_metadata()
        for config in configs:
            if config.name == project_name or config.id == project_name:
                return config.id
        raise KeyError(f"Unknown project config: {project_name}")

    def _resolve_section_id(self, section_ref: str | ID) -> ID:
        summary = self.summary()
        return summary.section(str(section_ref)).id

    def _encode_param_overrides(
        self,
        overrides: dict[SectionParamDependencyKey | tuple[ID, ID], str],
    ) -> dict[str, str]:
        return {
            f"{section_id}:{param_id}": value
            for key, value in overrides.items()
            for section_id, param_id in [_normalize_param_key(key)]
        }

    def _load_project_metadata(self) -> list[ProjectConfig]:
        if self._project_configs is not None:
            return self._project_configs
        data = self._post(Route.LOAD_ALL_PROJECT_METADATA, {})
        self._default_project_config_id = data.get("defaultProjectConfigId")
        self._project_configs = [
            ProjectConfig(**item) for item in data.get("projectMetadata", [])
        ]
        return self._project_configs
