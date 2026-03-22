import itertools
import random
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

import requests
from pydantic import BaseModel

from setta.auth.bootstrap import origin_from_backend_url, select_auth_cookie_name
from setta.auth.cookies import auth_cookie_name
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.sdk_contracts.generated import RunnerSummarySection, RunnerSummarySnapshot
from setta.sessions.registry import SessionRegistry
from setta.sessions.utils import resolve_sessions_root
from setta.types.dependency_key import SectionParamDependencyKey
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.routes import Route
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


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    exited = "exited"
    failed = "failed"
    canceled = "canceled"
    lost = "lost"


class RunDetachedResponse(BaseModel):
    runId: str
    status: RunStatus


class RunStatusResponse(BaseModel):
    runId: str
    status: RunStatus
    createdAtMs: int
    startedAtMs: int | None
    exitedAtMs: int | None
    exitCode: int | None
    pid: int | None
    command: str
    snapshotPath: str
    projectConfigId: ID
    entrySectionId: ID | None
    tags: dict[str, str]


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
            origin = origin_from_backend_url(self._base_url)
            consume_url = f"{origin}{Route.BOOTSTRAP_CONSUME.value}"
            response = self._session.post(
                consume_url,
                json={"token": self._bootstrap_token},
            )
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
            cookie_header = f"{cookie_name}={cookie_value}"
            return {"Cookie": cookie_header}
        session_info = load_current_session_secret()
        if session_info is not None:
            session_metadata, secret = session_info
            cookie_value = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
            return {"Cookie": f"{auth_cookie_name(session_metadata.id)}={cookie_value}"}

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
            cookie_header = None
        else:
            registry = SessionRegistry(sessions_root=sessions_root)
            sessions = registry.find_sessions_by_workspace(self._workspace_root)
            if not sessions:
                cookie_header = None
            else:
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
                    cookie_header = None
                else:
                    secret = secret_path.read_bytes()
                    token = AUTH_COOKIE_MANAGER.mint(selected.id, secret)
                    cookie_header = f"{auth_cookie_name(selected.id)}={token}"
        if cookie_header is not None:
            return {"Cookie": cookie_header}
        raise ValueError(
            "Missing Setta auth. Provide auth_headers or bootstrap_token, or set "
            "SETTA_SESSION_ID (and SETTA_SESSIONS_ROOT if running outside the session "
            "workspace)."
        )

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

    def _load_project_metadata(self) -> list[ProjectConfig]:
        if self._project_configs is not None:
            return self._project_configs
        data = self._post(Route.LOAD_ALL_PROJECT_METADATA, {})
        self._default_project_config_id = data.get("defaultProjectConfigId")
        self._project_configs = [
            ProjectConfig(**item) for item in data.get("projectMetadata", [])
        ]
        return self._project_configs
