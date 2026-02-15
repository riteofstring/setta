import json
import logging
import tempfile
from collections.abc import Callable
from io import StringIO
from pathlib import Path
from typing import Any

import toml
import yaml
from dotenv import dotenv_values, load_dotenv
from filelock import FileLock
from pydantic import ValidationError

from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)
from setta.types.notifications import SettaNotification
from setta.types.project_state import ProjectStateBackend, ProjectStateSingleConfig
from setta.types.section_impls import SectionType
from setta.types.share_deployment import DeploymentManifest
from setta.utils.paths import normalize_state_path, normalize_workspace_path
from setta.utils.utils import compute_md5_prefix

logger = logging.getLogger(__name__)

_REMOVED_SECTION_TYPES = frozenset({"Clock", "Calendar"})
_VALID_SECTION_TYPE_VALUES = frozenset(x.value for x in SectionType)
_SECTION_CODEGEN_POLICY_DEFAULT = {"mode": "inherit", "representation": "expression"}
_LEGACY_ALLOWLIST_AUTO_INCLUDE_SECTION_TYPES = (
    SectionType.TaskBoard.value,
    SectionType.Spreadsheet.value,
)
_LEGACY_DEFAULT_ALLOWLIST_BASELINE = frozenset(
    {
        SectionType.Callable.value,
        SectionType.Dict.value,
        SectionType.ListRoot.value,
        SectionType.Group.value,
        SectionType.GlobalVariables.value,
        SectionType.TextBlock.value,
        SectionType.Draw.value,
        SectionType.MetaControl.value,
    }
)


def _normalize_string_id(value: Any) -> str:
    return str(value)


def _sanitize_codegen_target_section_policy(
    target: dict[str, Any],
    valid_section_ids: set[str],
) -> None:
    section_policy = target.get("sectionPolicy")
    if not isinstance(section_policy, dict):
        return

    type_policies = section_policy.get("typePolicies")
    allowlist_auto_include: list[str] = []
    if not isinstance(type_policies, dict):
        allowlist_auto_include = list(_LEGACY_ALLOWLIST_AUTO_INCLUDE_SECTION_TYPES)
    else:
        for section_type in _LEGACY_ALLOWLIST_AUTO_INCLUDE_SECTION_TYPES:
            if section_type not in type_policies:
                allowlist_auto_include.append(section_type)

    allowlist = section_policy.get("allowlist")
    if isinstance(allowlist, list):
        normalized_allowlist = [
            x
            for x in allowlist
            if isinstance(x, str) and x in _VALID_SECTION_TYPE_VALUES
        ]
        if (
            not allowlist_auto_include
            and frozenset(normalized_allowlist) == _LEGACY_DEFAULT_ALLOWLIST_BASELINE
        ):
            allowlist_auto_include = list(_LEGACY_ALLOWLIST_AUTO_INCLUDE_SECTION_TYPES)
        seen_allowlist_values = set(normalized_allowlist)
        for section_type in allowlist_auto_include:
            if section_type in seen_allowlist_values:
                continue
            normalized_allowlist.append(section_type)
            seen_allowlist_values.add(section_type)
        section_policy["allowlist"] = normalized_allowlist

    exclude = section_policy.get("exclude")
    if isinstance(exclude, list):
        section_policy["exclude"] = [
            x for x in exclude if _normalize_string_id(x) in valid_section_ids
        ]

    section_overrides = section_policy.get("sectionOverrides")
    if isinstance(section_overrides, dict):
        section_policy["sectionOverrides"] = {
            section_id: override
            for section_id, override in section_overrides.items()
            if _normalize_string_id(section_id) in valid_section_ids
            and isinstance(override, dict)
        }

    if isinstance(type_policies, dict):
        filtered_policies: dict[str, Any] = {}
        for section_type in _VALID_SECTION_TYPE_VALUES:
            entry = type_policies.get(section_type)
            if not isinstance(entry, dict):
                entry = dict(_SECTION_CODEGEN_POLICY_DEFAULT)
            filtered_policies[section_type] = entry
        section_policy["typePolicies"] = filtered_policies


def _migrate_removed_section_types_from_project_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:
    section_impls = payload.get("sectionImpls")
    section_variants = payload.get("sectionVariants")
    sections = payload.get("sections")
    if (
        not isinstance(section_impls, dict)
        or not isinstance(section_variants, dict)
        or not isinstance(sections, dict)
    ):
        return payload

    removed_impl_ids = {
        _normalize_string_id(impl_id)
        for impl_id, impl in section_impls.items()
        if isinstance(impl, dict) and impl.get("type") in _REMOVED_SECTION_TYPES
    }

    # Legacy data may still use removed section types as default children.
    for impl in section_impls.values():
        if not isinstance(impl, dict):
            continue
        if impl.get("defaultChildSectionType") in _REMOVED_SECTION_TYPES:
            impl["defaultChildSectionType"] = SectionType.Callable.value

    removed_variant_ids: set[str] = set()
    for variant_id, variant in section_variants.items():
        if not isinstance(variant, dict):
            continue
        if _normalize_string_id(variant.get("impl")) in removed_impl_ids:
            removed_variant_ids.add(_normalize_string_id(variant_id))

    removed_section_ids: set[str] = set()
    valid_variant_ids = {
        _normalize_string_id(variant_id)
        for variant_id in section_variants.keys()
        if _normalize_string_id(variant_id) not in removed_variant_ids
    }
    for section_id, section in sections.items():
        if not isinstance(section, dict):
            continue
        section_variant_ids = [
            _normalize_string_id(variant_id)
            for variant_id in section.get("variants", [])
        ]
        filtered_variant_ids = [
            variant_id
            for variant_id in section_variant_ids
            if variant_id in valid_variant_ids
        ]
        if not filtered_variant_ids:
            removed_section_ids.add(_normalize_string_id(section_id))
            continue
        section["variants"] = filtered_variant_ids
        default_variant = _normalize_string_id(section.get("defaultVariant"))
        if default_variant not in filtered_variant_ids:
            section["defaultVariant"] = filtered_variant_ids[0]

    if removed_impl_ids:
        payload["sectionImpls"] = {
            impl_id: impl
            for impl_id, impl in section_impls.items()
            if _normalize_string_id(impl_id) not in removed_impl_ids
        }
    if removed_variant_ids:
        payload["sectionVariants"] = {
            variant_id: variant
            for variant_id, variant in section_variants.items()
            if _normalize_string_id(variant_id) not in removed_variant_ids
        }
    if removed_section_ids:
        payload["sections"] = {
            section_id: section
            for section_id, section in sections.items()
            if _normalize_string_id(section_id) not in removed_section_ids
        }

    remaining_section_ids = {
        _normalize_string_id(section_id) for section_id in payload["sections"].keys()
    }
    remaining_variant_ids = {
        _normalize_string_id(variant_id)
        for variant_id in payload["sectionVariants"].keys()
    }
    remaining_impl_ids = {
        _normalize_string_id(impl_id) for impl_id in payload["sectionImpls"].keys()
    }

    for variant in payload["sectionVariants"].values():
        if not isinstance(variant, dict):
            continue
        non_preset_impls = variant.get("nonPresetImpls")
        if isinstance(non_preset_impls, list):
            variant["nonPresetImpls"] = [
                impl_id
                for impl_id in non_preset_impls
                if _normalize_string_id(impl_id) in remaining_impl_ids
            ]

    for impl in payload["sectionImpls"].values():
        if not isinstance(impl, dict):
            continue
        children = impl.get("children")
        if isinstance(children, list):
            impl["children"] = [
                section_id
                for section_id in children
                if _normalize_string_id(section_id) in remaining_section_ids
            ]

    project_configs = payload.get("projectConfigs")
    if isinstance(project_configs, dict):
        for project_config in project_configs.values():
            if not isinstance(project_config, dict):
                continue

            section_variant_map = project_config.get("sectionVariantMap")
            if isinstance(section_variant_map, dict):
                project_config["sectionVariantMap"] = {
                    section_id: variant_id
                    for section_id, variant_id in section_variant_map.items()
                    if _normalize_string_id(section_id) in remaining_section_ids
                    and _normalize_string_id(variant_id) in remaining_variant_ids
                }

            top_level_sections = project_config.get("topLevelSections")
            if isinstance(top_level_sections, dict):
                project_config["topLevelSections"] = {
                    section_id: layout
                    for section_id, layout in top_level_sections.items()
                    if _normalize_string_id(section_id) in remaining_section_ids
                }

            active_ids = project_config.get("activeIds")
            if isinstance(active_ids, list):
                project_config["activeIds"] = [
                    section_id
                    for section_id in active_ids
                    if _normalize_string_id(section_id) in remaining_section_ids
                ]

            edges = project_config.get("edges")
            if isinstance(edges, list):
                project_config["edges"] = [
                    edge
                    for edge in edges
                    if isinstance(edge, dict)
                    and _normalize_string_id(edge.get("sourceSectionId"))
                    in remaining_section_ids
                    and _normalize_string_id(edge.get("targetSectionId"))
                    in remaining_section_ids
                    and _normalize_string_id(edge.get("sourceVariantId"))
                    in remaining_variant_ids
                    and _normalize_string_id(edge.get("targetVariantId"))
                    in remaining_variant_ids
                ]

            agentic_edges = project_config.get("agenticEdges")
            if isinstance(agentic_edges, list):
                project_config["agenticEdges"] = [
                    edge
                    for edge in agentic_edges
                    if isinstance(edge, dict)
                    and _normalize_string_id(edge.get("sourceSectionId"))
                    in remaining_section_ids
                    and _normalize_string_id(edge.get("targetSectionId"))
                    in remaining_section_ids
                ]

            view_modes = project_config.get("viewModes")
            if isinstance(view_modes, dict):
                for view_mode in view_modes.values():
                    if not isinstance(view_mode, dict):
                        continue
                    visibility = view_mode.get("visibilityBySectionId")
                    if isinstance(visibility, dict):
                        view_mode["visibilityBySectionId"] = {
                            section_id: is_visible
                            for section_id, is_visible in visibility.items()
                            if _normalize_string_id(section_id) in remaining_section_ids
                        }
                    view_top_level_sections = view_mode.get("topLevelSections")
                    if isinstance(view_top_level_sections, dict):
                        view_mode["topLevelSections"] = {
                            section_id: layout
                            for section_id, layout in view_top_level_sections.items()
                            if _normalize_string_id(section_id) in remaining_section_ids
                        }

            codegen_targets = project_config.get("codegenTargets")
            if isinstance(codegen_targets, list):
                for target in codegen_targets:
                    if not isinstance(target, dict):
                        continue
                    _sanitize_codegen_target_section_policy(
                        target=target,
                        valid_section_ids=remaining_section_ids,
                    )

    return payload


class DBE:
    def __init__(
        self,
        path: Path,
        *,
        runtime_root: Path | None = None,
        lock_root: Path | None = None,
    ):
        self.path = normalize_state_path(path)
        self.runtime_root = (
            normalize_state_path(runtime_root)
            if runtime_root is not None
            else self.path
        )
        self.lock_root = (
            normalize_state_path(lock_root)
            if lock_root is not None
            else self.runtime_root
        )
        self.project = self.path / "project.json"
        self.temporary_id_map = self.runtime_root / "temporary_id_map.json"
        self.notifications = self.path / "notifications.json"
        self.settings = self.path / "setta-settings.json"
        self.settings_project = self.path / "setta-settings-project.json"
        self.llm_config = self.path / "llm_config.json"
        self.llm_config_example = self.path / "llm_config.example.json"
        self.external_agents = self.path / "external_agents.json"
        self.engine_configs = self.path / "engine_configs.json"
        self.agent_profiles = self.path / "agent_profiles.json"
        self.agent_runs = self.path / "agent_runs"
        self.agent_run_index = self.path / "agent_run_index.json"
        self.agentic_summary_cache = self.path / "agentic_summary_cache.json"
        self.prompts = self.path / "prompts"
        self.prompts_example = self.path / "prompts.example.json"
        self.deployment_manifest = self.path / "manifest.json"
        self.dot_env = normalize_workspace_path(".env")
        self.path.mkdir(parents=True, exist_ok=True)
        if self.runtime_root != self.path:
            self.runtime_root.mkdir(parents=True, exist_ok=True)
        if self.lock_root not in (self.path, self.runtime_root):
            self.lock_root.mkdir(parents=True, exist_ok=True)

    def get_file_lock(self, path):
        locks_dir = self.lock_root / "file_locks"
        locks_dir.mkdir(parents=True, exist_ok=True)
        # Create a hash to avoid name conflicts
        path_hash = compute_md5_prefix(str(path.absolute()), 8)
        lock_filename = f"{path.name}_{path_hash}.lock"
        lock_path = locks_dir / lock_filename
        return FileLock(lock_path, timeout=10)

    def read(self, path: Path, mode="r"):
        if not path.exists():
            return None
        lock = self.get_file_lock(path)
        with lock:
            with open(path, mode) as f:
                return f.read()

    def write(self, path: Path, data, mode="w"):
        lock = self.get_file_lock(path)

        with lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode=mode, dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            Path(tmp_path).replace(path)

    def copy(self, source: Path, dest: Path):
        content = self.read(source, mode="rb")
        if content is None:
            raise FileNotFoundError(f"Source file {source} does not exist")
        self.write(dest, content, mode="wb")

    def read_json(self, path: Path):
        x = self.read(path)
        if x is None:
            return {}
        return json.loads(x)

    def write_json(self, path: Path, data: Any):
        def default(obj: Any):
            if isinstance(obj, Path):
                return str(obj)
            raise TypeError(
                f"Object of type {obj.__class__.__name__} is not JSON serializable"
            )

        self.write(path, json.dumps(data, indent=2, sort_keys=True, default=default))

    def update_json(self, path: Path, update_fn: Callable[[Any], Any]) -> Any:
        """Atomically update a JSON file under a single file lock.

        This prevents lost updates when multiple writers do a read/modify/write cycle
        concurrently.
        """

        def default(obj: Any):
            if isinstance(obj, Path):
                return str(obj)
            raise TypeError(
                f"Object of type {obj.__class__.__name__} is not JSON serializable"
            )

        lock = self.get_file_lock(path)
        with lock:
            payload: Any
            if path.exists():
                raw = path.read_text(encoding="utf-8")
                payload = json.loads(raw) if raw else {}
            else:
                payload = {}

            updated = update_fn(payload)

            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                tmp.write(
                    json.dumps(updated, indent=2, sort_keys=True, default=default)
                )
                tmp_path = tmp.name

            Path(tmp_path).replace(path)
            return updated

    def read_yaml(self, path: Path) -> Any:
        raw = self.read(path)
        if raw is None:
            return {}
        return yaml.safe_load(raw)

    def write_yaml(self, path: Path, data: Any) -> None:
        payload = yaml.safe_dump(data, sort_keys=False)
        self.write(path, payload)

    def read_toml(self, path: Path) -> Any:
        raw = self.read(path)
        if raw is None:
            return {}
        return toml.loads(raw)

    def write_toml(self, path: Path, data: Any) -> None:
        payload = toml.dumps(data)
        self.write(path, payload)

    def read_jsonl(self, path: Path) -> list[dict]:
        if not path.exists():
            return []

        lock = self.get_file_lock(path)
        items: list[dict] = []
        with lock:
            with open(path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        items.append(json.loads(line))
        return items

    def write_jsonl(self, path: Path, items: list[dict]):
        lock = self.get_file_lock(path)

        with lock:
            with tempfile.NamedTemporaryFile(
                mode="w", dir=path.parent, delete=False, suffix=".tmp"
            ) as tmp:
                for item in items:
                    json.dump(item, tmp, sort_keys=True)
                    tmp.write("\n")
                tmp_path = tmp.name

            Path(tmp_path).replace(path)

    def read_project(self):
        payload = self.read_json(self.project)
        if not isinstance(payload, dict):
            payload = {}
        payload = _migrate_removed_section_types_from_project_payload(payload)
        return ProjectStateBackend.model_validate(payload)

    def write_project(self, project: ProjectStateBackend):
        self.write_json(self.project, project.model_dump(mode="json"))

    def read_project_required(self) -> ProjectStateBackend:
        if not self.project.exists():
            raise FileNotFoundError(f"Project file not found: {self.project}")
        payload = json.loads(self.project.read_text(encoding="utf-8"))
        if not payload:
            raise ValueError(f"Project file is empty: {self.project}")
        if not isinstance(payload, dict):
            raise TypeError("Project payload must be a JSON object.")
        payload = _migrate_removed_section_types_from_project_payload(payload)
        return ProjectStateBackend.model_validate(payload)

    def read_deployment_manifest(self) -> DeploymentManifest:
        if not self.deployment_manifest.exists():
            raise FileNotFoundError(
                f"Deployment manifest not found: {self.deployment_manifest}"
            )
        payload = json.loads(self.deployment_manifest.read_text(encoding="utf-8"))
        if not payload:
            raise ValueError(
                f"Deployment manifest is empty: {self.deployment_manifest}"
            )
        return DeploymentManifest.model_validate(payload)

    def read_deployment_manifest_optional(self) -> DeploymentManifest | None:
        if not self.deployment_manifest.exists():
            return None
        payload = json.loads(self.deployment_manifest.read_text(encoding="utf-8"))
        if not payload:
            return None
        try:
            return DeploymentManifest.model_validate(payload)
        except ValidationError as exc:
            logger.warning(
                "Invalid deployment manifest at %s: %s",
                self.deployment_manifest,
                exc,
            )
            return None

    def read_temporary_id_map(self):
        raw_map = self.read_json(self.temporary_id_map)
        canonical_to_temporary: CanonicalToTemporaryIDMap = {
            ID(k): ID(v) for k, v in raw_map.items()
        }
        temporary_to_canonical: TemporaryToCanonicalIDMap = {
            ID(v): ID(k) for k, v in raw_map.items()
        }
        return temporary_to_canonical, canonical_to_temporary

    def write_temporary_id_map(self, canonical_to_temporary: CanonicalToTemporaryIDMap):
        serializable_map = {str(k): str(v) for k, v in canonical_to_temporary.items()}
        self.write_json(self.temporary_id_map, serializable_map)

    def read_notifications(self, projectConfigId: ID | None = None):
        data = self.read_jsonl(self.notifications)
        data = [SettaNotification.model_validate(item) for item in data]
        if projectConfigId:
            return [s for s in data if s.projectConfigId == projectConfigId]
        return data

    def write_notifications(self, notifications: list[SettaNotification]):
        data = [n.model_dump() for n in notifications]
        self.write_jsonl(self.notifications, data)

    def delete_notification(self, notification_id: ID):
        data = self.read_notifications()
        filtered = [item for item in data if item.id != notification_id]
        self.write_notifications(filtered)

    def read_settings_project(self):
        return ProjectStateSingleConfig.model_validate(
            self.read_json(self.settings_project)
        )

    def write_settings_project(self, settings_project: ProjectStateSingleConfig):
        self.write_json(self.settings_project, settings_project.model_dump(mode="json"))

    def read_llm_config(self) -> dict[str, Any]:
        return self.read_json(self.llm_config)

    def write_llm_config(self, payload: Any) -> None:
        self.write_json(self.llm_config, payload)

    def read_llm_config_example(self) -> dict[str, Any]:
        return self.read_json(self.llm_config_example)

    def write_llm_config_example(self, payload: Any) -> None:
        self.write_json(self.llm_config_example, payload)

    def read_external_agents(self) -> list[dict]:
        payload = self.read_json(self.external_agents)
        if not payload:
            return []
        if not isinstance(payload, list):
            raise ValueError("external_agents.json must contain a list of configs")
        return payload

    def write_external_agents(self, payload: list[dict]) -> None:
        self.write_json(self.external_agents, payload)

    def read_engine_configs(self) -> list[dict]:
        payload = self.read_json(self.engine_configs)
        if not payload:
            return []
        if not isinstance(payload, list):
            raise ValueError("engine_configs.json must contain a list of configs")
        return payload

    def write_engine_configs(self, payload: list[dict]) -> None:
        self.write_json(self.engine_configs, payload)

    def read_agent_run_index(self) -> dict[str, Any]:
        payload = self.read_json(self.agent_run_index)
        if not payload:
            return {}
        if not isinstance(payload, dict):
            raise ValueError("agent_run_index.json must contain an object")
        return payload

    def write_agent_run_index(self, payload: dict[str, Any]) -> None:
        self.write_json(self.agent_run_index, payload)

    def read_prompts_example(self) -> Any:
        return self.read_json(self.prompts_example)

    def write_prompts_example(self, payload: Any) -> None:
        self.write_json(self.prompts_example, payload)

    def read_dot_env(self) -> dict[str, str]:
        raw = self.read(self.dot_env)
        if raw is None:
            return {}
        env_vars = dotenv_values(stream=StringIO(raw))
        return {key: value for key, value in env_vars.items() if value is not None}

    def reload_dot_env(self) -> None:
        load_dotenv(dotenv_path=self.dot_env, override=True)

    def write_dot_env(self, env_vars: dict[str, str]) -> None:
        lines = [f"{key}={value}" for key, value in env_vars.items()]
        content = "\n".join(lines)
        if content:
            content += "\n"
        self.write(self.dot_env, content)

    def read_agent_profiles(self) -> list[dict]:
        payload = self.read_json(self.agent_profiles)
        if not payload:
            return []
        if not isinstance(payload, list):
            raise ValueError("agent_profiles.json must contain a list of profiles")
        return payload

    def write_agent_profiles(self, payload: list[dict]) -> None:
        self.write_json(self.agent_profiles, payload)

    def agent_run_path(self, run_id: ID) -> Path:
        return self.agent_runs / f"{run_id}.json"

    def read_agent_run(self, run_id: ID) -> dict | None:
        path = self.agent_run_path(run_id)
        if not path.exists():
            return None
        data = self.read_json(path)
        if not data:
            return None
        return data

    def write_agent_run(self, run_id: ID, payload: dict) -> None:
        self.write_json(self.agent_run_path(run_id), payload)

    def list_agent_run_paths(self) -> list[Path]:
        if not self.agent_runs.exists():
            return []
        return sorted(self.agent_runs.glob("*.json"))

    def delete_agent_run_file(self, run_id: ID) -> None:
        path = self.agent_run_path(run_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()

    def prompt_path(self, prompt_id: ID) -> Path:
        return self.prompts / f"{prompt_id}.json"

    def read_prompt(self, prompt_id: ID) -> dict | None:
        path = self.prompt_path(prompt_id)
        if not path.exists():
            return None
        data = self.read_json(path)
        if not data:
            return None
        return data

    def write_prompt(self, prompt_id: ID, payload: dict) -> None:
        self.write_json(self.prompt_path(prompt_id), payload)

    def list_prompt_paths(self) -> list[Path]:
        if not self.prompts.exists():
            return []
        return sorted(self.prompts.glob("*.json"))

    def delete_prompt_file(self, prompt_id: ID) -> None:
        path = self.prompt_path(prompt_id)
        lock = self.get_file_lock(path)
        with lock:
            if path.exists():
                path.unlink()
