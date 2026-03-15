import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException

from setta.database.db_objs import DBE
from setta.deployments.deployment_utils import (
    iter_deployment_versions,
    rewrite_project_state_paths,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.project_config import ProjectConfig
from setta.types.section_impls import CodeFileBinding
from setta.types.share_deployment import DeploymentListenerConfig, DeploymentManifest
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths
from setta.utils.utils import compute_md5_prefix, normalize_path

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateBackend


def normalize_deployment_name(deployment_name: str) -> str:
    normalized = deployment_name.strip()
    if not normalized:
        raise HTTPException(
            status_code=400,
            detail="Deployment name is required.",
        )
    if Path(normalized).name != normalized:
        raise HTTPException(
            status_code=400,
            detail="Deployment name must be a single path segment.",
        )
    if normalized in {".", ".."}:
        raise HTTPException(
            status_code=400,
            detail="Deployment name must not be '.' or '..'.",
        )
    return normalized


def create_deployment_root(deployment_name: str) -> tuple[str, Path]:
    normalized_name = normalize_deployment_name(deployment_name)
    deployment_parent = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / normalized_name)
    deployment_parent.mkdir(parents=True, exist_ok=True)
    version_numbers = [
        number for number, _ in iter_deployment_versions(deployment_parent)
    ]
    next_number = max(version_numbers, default=0) + 1
    deployment_version = f"v{next_number}"
    deployment_root = normalize_path(deployment_parent / deployment_version)
    deployment_root.mkdir(parents=True, exist_ok=False)
    return deployment_version, deployment_root


def resolve_source_path(path_str: str) -> Path:
    source_path = Path(path_str)
    if source_path.is_absolute():
        return source_path
    return (get_setta_paths().workspace_root / source_path).resolve(strict=False)


def external_filename(source_path: Path) -> Path:
    digest = compute_md5_prefix(str(source_path), 8)
    stem = source_path.stem or "file"
    return Path(f"{stem}_{digest}{source_path.suffix}")


def copy_file(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def deployment_relative_path(target_path: Path, deployment_root: Path) -> str:
    try:
        return target_path.relative_to(deployment_root).as_posix()
    except ValueError:
        return target_path.as_posix()


def artifact_target_path(source_path: Path, artifacts_root: Path) -> Path:
    artifacts_folder = C.ARTIFACTS_FOLDER.resolve(strict=False)
    if source_path.is_relative_to(artifacts_folder):
        return artifacts_root / source_path.relative_to(artifacts_folder)
    return artifacts_root / external_filename(source_path)


def code_target_path(source_path: Path, code_root: Path) -> Path:
    code_folder = C.CODE_FOLDER.resolve(strict=False)
    if source_path.is_relative_to(code_folder):
        return code_root / source_path.relative_to(code_folder)
    return code_root / external_filename(source_path)


def json_source_target_path(source_path: Path, json_root: Path) -> Path:
    normalized = normalize_path(source_path)
    if not normalized.is_absolute():
        return json_root / normalized
    # JSON sources can be referenced via absolute paths. Prefer a stable filename when
    # the source file exists by hashing its contents; otherwise fall back to hashing
    # the (absolute) path string.
    digest_source: bytes | str = str(source_path)
    if source_path.exists() and source_path.is_file():
        try:
            digest_source = source_path.read_bytes()
        except OSError:
            digest_source = str(source_path)
    digest = compute_md5_prefix(digest_source, 8)
    stem = source_path.stem or "file"
    return json_root / Path(f"{stem}_{digest}{source_path.suffix}")


def copy_artifact_path(
    path_str: str,
    artifacts_root: Path,
    deployment_root: Path,
    path_map: dict[str, str],
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = resolve_source_path(path_str)
    target_path = artifact_target_path(source_path, artifacts_root)
    copy_file(source_path, target_path)
    rebased = deployment_relative_path(target_path, deployment_root)
    path_map[path_str] = rebased
    return rebased


def rebase_json_source_path(
    path_str: str,
    json_root: Path,
    deployment_root: Path,
    path_map: dict[str, str],
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = resolve_source_path(path_str)
    target_path = json_source_target_path(source_path, json_root)
    rebased = deployment_relative_path(target_path, deployment_root)
    path_map[path_str] = rebased
    return rebased


def copy_code_file_binding(
    binding: CodeFileBinding,
    code_root: Path,
    deployment_root: Path,
    path_map: dict[str, CodeFileBinding],
) -> CodeFileBinding:
    path_key = str(binding.canonical_path)
    existing = path_map.get(path_key)
    if existing:
        return existing
    source_path = resolve_source_path(path_key)
    target_path = code_target_path(source_path, code_root)
    copy_file(source_path, target_path)
    rebased = deployment_relative_path(target_path, deployment_root)
    new_binding = CodeFileBinding(
        canonical_path=Path(rebased),
        access_mode=binding.access_mode,
        autoBinding=binding.autoBinding,
    )
    path_map[path_key] = new_binding
    return new_binding


def rebase_project_state_paths(
    project_state: "ProjectStateBackend", deployment_root: Path
) -> None:
    artifacts_root = deployment_root / "artifacts"
    json_root = deployment_root / "json_sources"
    code_root = deployment_root / "code"
    artifact_path_map: dict[str, str] = {}
    json_path_map: dict[str, str] = {}
    code_path_map: dict[str, CodeFileBinding] = {}

    rewrite_project_state_paths(
        project_state,
        resolve_artifact_path=lambda path_str: copy_artifact_path(
            path_str,
            artifacts_root,
            deployment_root,
            artifact_path_map,
        ),
        resolve_code_binding=lambda binding: copy_code_file_binding(
            binding,
            code_root,
            deployment_root,
            code_path_map,
        ),
        resolve_json_source_name=lambda path_str: rebase_json_source_path(
            path_str,
            json_root,
            deployment_root,
            json_path_map,
        ),
    )


def ensure_snapshot_view_modes(
    snapshot: "ProjectStateBackend",
) -> "ProjectStateBackend":
    updated = snapshot
    for project_config_id in list(snapshot.projectConfigs.keys()):
        single_state = convert_backend_to_single_config(updated, project_config_id)
        single_state.validate_view_modes()
        updated = merge_single_config_into_backend(updated, single_state)
    return updated


def resolve_deployment_relative_path(path: Path, deployment_root: Path) -> Path:
    if path.is_absolute():
        raise HTTPException(
            status_code=400,
            detail=f"Deployment-relative path must be relative, got: {path}",
        )
    resolved_root = deployment_root.resolve()
    resolved = (resolved_root / path).resolve()
    if not resolved.is_relative_to(resolved_root):
        raise HTTPException(
            status_code=400,
            detail="Deployment-relative path escaped deployment root.",
        )
    return resolved


def copy_listener_entrypoint(
    source_path: str,
    deployment_root: Path,
    *,
    enabled: bool,
) -> DeploymentListenerConfig:
    listener_root = deployment_root / "listener"
    target_path = listener_root / "app.py"
    copy_file(resolve_source_path(source_path), target_path)
    return DeploymentListenerConfig(
        entrypoint=Path("listener/app.py").as_posix(),
        enabled=enabled,
    )


def resolve_default_project_config(
    manifest: DeploymentManifest, deployment_root: Path
) -> ProjectConfig | None:
    project_state = DBE(deployment_root).read_project_required()
    default_project_config_id = manifest.defaultProjectConfigId
    project_configs = project_state.projectConfigs
    if default_project_config_id not in project_configs:
        return None
    return project_configs[default_project_config_id]


def manifest_matches_root(manifest: DeploymentManifest, deployment_root: Path) -> bool:
    if manifest.deploymentName != deployment_root.parent.name:
        return False
    if manifest.deploymentVersion != deployment_root.name:
        return False
    return True
