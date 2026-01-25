import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, Request, status
from pydantic import BaseModel

from setta.database.db_objs import DBE
from setta.logging.project_id_route import require_project_context
from setta.project_state.jsonSource.save import build_json_source_dicts
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.routers.dependencies import (
    ReadyAppStateFromRequest as AppStateFromRequest,
)
from setta.routers.dependencies import (
    maybe_get_share_session_id_from_request,
    require_share_session_id,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.share.deployment_utils import (
    iter_share_deployment_versions,
    rewrite_project_state_paths,
)
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.routes import Route
from setta.types.section_impls import (
    CodeFileBinding,
)
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import (
    ShareDeploymentListenerConfig,
    ShareDeploymentManifest,
    ShareDeploymentMetadata,
    ShareDeploymentSessionResponse,
    SharePolicy,
)
from setta.utils.constants import CWD, C
from setta.utils.structured_data import write_json_source_payload
from setta.utils.utils import compute_md5_prefix, normalize_path

logger = logging.getLogger(__name__)

router = SettaProjectContextAPIRouter()

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateBackend


class SharePolicyOverrides(BaseModel, extra="forbid"):
    allowParamChanges: bool | None = None
    allowVariantChanges: bool | None = None
    allowLayoutChanges: bool | None = None
    allowRun: bool | None = None
    allowLLM: bool | None = None
    runSnapshotMode: RunSnapshotMode | None = None


class PublishShareDeploymentRequest(BaseModel, extra="forbid"):
    deploymentName: str
    projectConfigId: ID
    sharePolicyOverrides: SharePolicyOverrides | None = None
    listenerEntrypoint: str | None = None
    listenerEnabled: bool = True


class LoadShareProjectConfigRequest(BaseModel, extra="forbid"):
    projectConfigId: ID


def _normalize_deployment_name(deployment_name: str) -> str:
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
    return normalized


def _create_deployment_root(deployment_name: str) -> tuple[str, Path]:
    normalized_name = _normalize_deployment_name(deployment_name)
    deployment_parent = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / normalized_name)
    deployment_parent.mkdir(parents=True, exist_ok=True)
    version_numbers = [
        number for number, _ in iter_share_deployment_versions(deployment_parent)
    ]
    next_number = max(version_numbers, default=0) + 1
    deployment_version = f"v{next_number}"
    deployment_root = normalize_path(deployment_parent / deployment_version)
    deployment_root.mkdir(parents=True, exist_ok=False)
    return deployment_version, deployment_root


def _resolve_source_path(path_str: str) -> Path:
    source_path = Path(path_str)
    if source_path.is_absolute():
        return source_path
    return (CWD / source_path).resolve()


def _external_filename(source_path: Path) -> Path:
    digest = compute_md5_prefix(str(source_path), 8)
    stem = source_path.stem or "file"
    return Path(f"{stem}_{digest}{source_path.suffix}")


def _artifact_target_path(source_path: Path, artifacts_root: Path) -> Path:
    artifacts_folder = (CWD / C.ARTIFACTS_FOLDER).resolve()
    if source_path.is_relative_to(artifacts_folder):
        return artifacts_root / source_path.relative_to(artifacts_folder)
    return artifacts_root / _external_filename(source_path)


def _get_or_create_share_session_id(
    state: AppStateFromRequest,
    request: Request,
) -> str:
    share_session_id = maybe_get_share_session_id_from_request(request)
    if share_session_id and state.share_session_store.has_session(share_session_id):
        state.share_session_store.touch_session(share_session_id)
        state.share_runtime_state.get_or_create_session_backend(share_session_id)
        return share_session_id
    session = state.share_session_store.create_session()
    state.share_runtime_state.create_session_backend(session.id)
    return session.id


def _ensure_snapshot_view_modes(
    snapshot: "ProjectStateBackend",
) -> "ProjectStateBackend":
    updated = snapshot
    for project_config_id in list(snapshot.projectConfigs.keys()):
        single_state = convert_backend_to_single_config(updated, project_config_id)
        single_state.validate_view_modes()
        updated = merge_single_config_into_backend(updated, single_state)
    return updated


def _code_target_path(source_path: Path, code_root: Path) -> Path:
    code_folder = (CWD / C.CODE_FOLDER).resolve()
    if source_path.is_relative_to(code_folder):
        return code_root / source_path.relative_to(code_folder)
    return code_root / _external_filename(source_path)


def _json_source_target_path(source_path: Path, json_root: Path) -> Path:
    normalized = normalize_path(source_path)
    if not normalized.is_absolute():
        return json_root / normalized
    return json_root / _external_filename(source_path)


def _copy_file(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def _share_relative_path(target_path: Path, deployment_root: Path) -> str:
    try:
        return target_path.relative_to(deployment_root).as_posix()
    except ValueError:
        return target_path.as_posix()


def _copy_artifact_path(
    path_str: str,
    artifacts_root: Path,
    deployment_root: Path,
    path_map: dict[str, str],
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = _resolve_source_path(path_str)
    target_path = _artifact_target_path(source_path, artifacts_root)
    _copy_file(source_path, target_path)
    rebased = _share_relative_path(target_path, deployment_root)
    path_map[path_str] = rebased
    return rebased


def _copy_json_source_path(
    path_str: str,
    json_root: Path,
    deployment_root: Path,
    path_map: dict[str, str],
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = _resolve_source_path(path_str)
    target_path = _json_source_target_path(source_path, json_root)
    rebased = _share_relative_path(target_path, deployment_root)
    path_map[path_str] = rebased
    return rebased


def _copy_code_file_binding(
    binding: CodeFileBinding,
    code_root: Path,
    deployment_root: Path,
    path_map: dict[str, CodeFileBinding],
) -> CodeFileBinding:
    path_key = str(binding.canonical_path)
    existing = path_map.get(path_key)
    if existing:
        return existing
    source_path = _resolve_source_path(path_key)
    target_path = _code_target_path(source_path, code_root)
    _copy_file(source_path, target_path)
    rebased = _share_relative_path(target_path, deployment_root)
    new_binding = CodeFileBinding(
        canonical_path=Path(rebased),
        access_mode=binding.access_mode,
    )
    path_map[path_key] = new_binding
    return new_binding


def _apply_share_policy_overrides(
    overrides: SharePolicyOverrides | None,
) -> SharePolicy:
    policy = SharePolicy()
    if overrides:
        policy = policy.model_copy(update=overrides.model_dump(exclude_none=True))
    return policy


def _require_share_mode(state: AppStateFromRequest) -> None:
    if not state.share_mode:
        raise HTTPException(
            status_code=400,
            detail="Share mode is not enabled for this server.",
        )


def _expected_share_deployment(state: AppStateFromRequest) -> tuple[str, str]:
    if state.share_deployment_root is None:
        raise HTTPException(
            status_code=400,
            detail="Share deployment root is not configured.",
        )
    return (
        state.share_runtime_state.deployment_name,
        state.share_runtime_state.deployment_version,
    )


def _require_matching_deployment(
    state: AppStateFromRequest,
    deployment_name: str,
    version: str,
) -> None:
    expected_name, expected_version = _expected_share_deployment(state)
    if deployment_name != expected_name or version != expected_version:
        raise HTTPException(
            status_code=404,
            detail=(f"Share deployment not found: {deployment_name}/{version}"),
        )


def _rebase_project_state_paths(
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
        resolve_artifact_path=lambda path_str: _copy_artifact_path(
            path_str,
            artifacts_root,
            deployment_root,
            artifact_path_map,
        ),
        resolve_code_binding=lambda binding: _copy_code_file_binding(
            binding,
            code_root,
            deployment_root,
            code_path_map,
        ),
        resolve_json_source_name=lambda path_str: _copy_json_source_path(
            path_str,
            json_root,
            deployment_root,
            json_path_map,
        ),
    )


def _resolve_deployment_relative_path(path: Path, deployment_root: Path) -> Path:
    if path.is_absolute():
        return path
    return (deployment_root / path).resolve()


def _copy_listener_entrypoint(
    source_path: str,
    deployment_root: Path,
    *,
    enabled: bool,
) -> ShareDeploymentListenerConfig:
    listener_root = deployment_root / "listener"
    target_path = listener_root / "app.py"
    _copy_file(_resolve_source_path(source_path), target_path)
    return ShareDeploymentListenerConfig(
        entrypoint=Path("listener/app.py").as_posix(),
        enabled=enabled,
    )


def _resolve_default_project_config(
    manifest: ShareDeploymentManifest, deployment_root: Path
) -> ProjectConfig | None:
    project_state = DBE(deployment_root).read_project_required()
    default_project_config_id = manifest.defaultProjectConfigId
    project_configs = project_state.projectConfigs
    if default_project_config_id not in project_configs:
        return None
    return project_configs[default_project_config_id]


def _manifest_matches_root(
    manifest: ShareDeploymentManifest, deployment_root: Path
) -> bool:
    if deployment_root.name != manifest.deploymentVersion:
        return False
    if deployment_root.parent.name != manifest.deploymentName:
        return False
    return True


def _metadata_from_manifest(
    manifest: ShareDeploymentManifest,
    deployment_root: Path,
    default_project_config_name: str,
    *,
    redact_paths: bool = False,
) -> ShareDeploymentMetadata:
    if redact_paths:
        redacted = Path("redacted")
        return ShareDeploymentMetadata(
            deploymentName=manifest.deploymentName,
            deploymentVersion=manifest.deploymentVersion,
            defaultProjectConfigId=manifest.defaultProjectConfigId,
            defaultProjectConfigName=default_project_config_name,
            createdAt=manifest.createdAt,
            deploymentRoot=redacted,
            sharePolicyPath=redacted,
        )
    return ShareDeploymentMetadata(
        deploymentName=manifest.deploymentName,
        deploymentVersion=manifest.deploymentVersion,
        defaultProjectConfigId=manifest.defaultProjectConfigId,
        defaultProjectConfigName=default_project_config_name,
        createdAt=manifest.createdAt,
        deploymentRoot=normalize_path(deployment_root),
        sharePolicyPath=normalize_path(deployment_root / "share_policy.json"),
    )


@router.get(Route.SHARE_DEPLOYMENTS)
def route_list_share_deployments(
    state: AppStateFromRequest,
) -> list[ShareDeploymentMetadata]:
    if state.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share mode does not allow listing deployments.",
        )
    deployments_root = C.SHARE_DEPLOYMENTS_FOLDER
    if not deployments_root.exists():
        return []
    deployments: list[ShareDeploymentMetadata] = []
    for deployment_root in sorted(deployments_root.iterdir()):
        if not deployment_root.is_dir():
            continue
        for _, version_root in iter_share_deployment_versions(deployment_root):
            manifest = DBE(version_root).read_share_manifest_optional()
            if manifest is None:
                continue
            if not _manifest_matches_root(manifest, version_root):
                continue
            default_config = _resolve_default_project_config(manifest, version_root)
            if default_config is None:
                continue
            deployments.append(
                _metadata_from_manifest(
                    manifest,
                    version_root,
                    default_config.name,
                )
            )
    deployments.sort(key=lambda item: item.createdAt, reverse=True)
    return deployments


@router.get(Route.SHARE_DEPLOYMENT_VERSIONS)
def route_list_share_deployment_versions(
    deploymentName: str,
    state: AppStateFromRequest,
) -> list[ShareDeploymentMetadata]:
    if state.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share mode does not allow listing deployment versions.",
        )
    deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / deploymentName)
    if not deployment_root.exists():
        return []
    versions = sorted(
        iter_share_deployment_versions(deployment_root),
        key=lambda item: item[0],
        reverse=True,
    )
    deployments: list[ShareDeploymentMetadata] = []
    for _, version_root in versions:
        manifest = DBE(version_root).read_share_manifest_optional()
        if manifest is None:
            continue
        if not _manifest_matches_root(manifest, version_root):
            continue
        default_config = _resolve_default_project_config(manifest, version_root)
        if default_config is None:
            continue
        deployments.append(
            _metadata_from_manifest(
                manifest,
                version_root,
                default_config.name,
            )
        )
    return deployments


@router.get(Route.SHARE_DEPLOYMENT_LATEST)
def route_get_latest_share_deployment(
    deploymentName: str,
    state: AppStateFromRequest,
) -> ShareDeploymentMetadata:
    if state.share_mode:
        expected_name = state.share_runtime_state.deployment_name
        if deploymentName != expected_name:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deploymentName}",
            )
        manifest = state.share_runtime_state.manifest
        if manifest is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deploymentName}",
            )
        if state.share_deployment_root is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deploymentName}",
            )
        return _metadata_from_manifest(
            manifest,
            state.share_deployment_root,
            state.share_runtime_state.default_project_config_name,
            redact_paths=True,
        )
    deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / deploymentName)
    if not deployment_root.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deploymentName}",
        )
    versions = iter_share_deployment_versions(deployment_root)
    if not versions:
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deploymentName}",
        )
    _, latest_root = max(versions, key=lambda item: item[0])
    manifest = DBE(latest_root).read_share_manifest_optional()
    if manifest is None or not _manifest_matches_root(manifest, latest_root):
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deploymentName}",
        )
    default_config = _resolve_default_project_config(manifest, latest_root)
    if default_config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deploymentName}",
        )
    return _metadata_from_manifest(
        manifest,
        latest_root,
        default_config.name,
    )


@router.post(Route.SHARE_DEPLOYMENT_CURRENT_SESSION)
async def route_create_share_session_current(
    request: Request,
    state: AppStateFromRequest,
) -> ShareDeploymentSessionResponse:
    _require_share_mode(state)
    share_session_id = _get_or_create_share_session_id(state, request)
    return ShareDeploymentSessionResponse(
        deploymentName=state.share_runtime_state.deployment_name,
        deploymentVersion=state.share_runtime_state.deployment_version,
        shareSessionId=share_session_id,
        defaultProjectConfigId=state.share_runtime_state.default_project_config_id,
        projectMetadata=list(
            state.share_runtime_state.project_state_backend.projectConfigs.values()
        ),
        sharePolicy=state.share_runtime_state.share_policy,
        manifest=state.share_runtime_state.manifest,
    )


@router.post(Route.SHARE_DEPLOYMENT_SESSION)
async def route_create_share_session(
    deploymentName: str,
    version: str,
    request: Request,
    state: AppStateFromRequest,
) -> ShareDeploymentSessionResponse:
    _require_share_mode(state)
    _require_matching_deployment(state, deploymentName, version)
    share_session_id = _get_or_create_share_session_id(state, request)
    return ShareDeploymentSessionResponse(
        deploymentName=state.share_runtime_state.deployment_name,
        deploymentVersion=state.share_runtime_state.deployment_version,
        shareSessionId=share_session_id,
        defaultProjectConfigId=state.share_runtime_state.default_project_config_id,
        projectMetadata=list(
            state.share_runtime_state.project_state_backend.projectConfigs.values()
        ),
        sharePolicy=state.share_runtime_state.share_policy,
        manifest=state.share_runtime_state.manifest,
    )


@router.get(Route.SHARE_DEPLOYMENT_STATE)
async def route_get_share_deployment_state(
    deploymentName: str,
    version: str,
    state: AppStateFromRequest,
    request: Request,
) -> ProjectStateSingleConfigWithCompletedOpIds:
    _require_share_mode(state)
    _require_matching_deployment(state, deploymentName, version)
    share_session_id = require_share_session_id(
        state,
        maybe_get_share_session_id_from_request(request),
    )
    project_config_id = state.share_runtime_state.default_project_config_id
    await state.share_listener_runtime.ensure_listener_for_session(
        share_session_id,
        project_config_id,
    )
    project_state = state.share_runtime_state.get_session_state_for_client(
        share_session_id,
        project_config_id,
    )
    return ProjectStateSingleConfigWithCompletedOpIds(
        projectState=project_state,
        completedOpIds=[],
        pendingOpIds=[],
    )


@router.post(Route.SHARE_DEPLOYMENT_PROJECT_CONFIG)
async def route_load_share_project_config(
    deploymentName: str,
    version: str,
    x: LoadShareProjectConfigRequest,
    state: AppStateFromRequest,
    request: Request,
) -> ProjectStateSingleConfigWithCompletedOpIds:
    _require_share_mode(state)
    _require_matching_deployment(state, deploymentName, version)
    share_session_id = require_share_session_id(
        state,
        maybe_get_share_session_id_from_request(request),
    )
    session_backend = state.share_runtime_state.get_session_backend(share_session_id)
    if x.projectConfigId not in session_backend.projectConfigs:
        raise HTTPException(
            status_code=404,
            detail=f"Project config not found: {x.projectConfigId}",
        )
    await state.share_listener_runtime.ensure_listener_for_session(
        share_session_id,
        x.projectConfigId,
    )
    project_state = state.share_runtime_state.get_session_state_for_client(
        share_session_id,
        x.projectConfigId,
    )
    logger.info(
        "Share project config loaded: deployment=%s version=%s config_id=%s active_view_mode_id=%s view_modes=%s",
        deploymentName,
        version,
        x.projectConfigId,
        project_state.projectConfig.activeViewModeId,
        len(project_state.projectConfig.viewModes),
    )
    return ProjectStateSingleConfigWithCompletedOpIds(
        projectState=project_state,
        completedOpIds=[],
        pendingOpIds=[],
    )


@router.post(Route.SHARE_DEPLOYMENTS)
@require_project_context()
async def route_publish_share_deployment(
    x: PublishShareDeploymentRequest, state: AppStateFromRequest
) -> ShareDeploymentMetadata:
    if getattr(state, "share_mode", False):
        raise HTTPException(
            status_code=403,
            detail="Share mode does not allow publishing deployments.",
        )
    project_manager = state.project_manager_switcher.get(x.projectConfigId)
    await project_manager.finish_pending_operations()
    project_manager._flush_code_files_for_all_configs()
    project_state_backend = project_manager.project_state_backend
    if x.projectConfigId not in project_state_backend.projectConfigs:
        raise HTTPException(
            status_code=404, detail=f"Project config not found: {x.projectConfigId}"
        )

    project_config = project_state_backend.projectConfigs[x.projectConfigId]
    deployment_name = _normalize_deployment_name(x.deploymentName)
    deployment_version, deployment_root = _create_deployment_root(deployment_name)
    policy = _apply_share_policy_overrides(x.sharePolicyOverrides)
    if policy.runSnapshotMode == RunSnapshotMode.never:
        raise HTTPException(
            status_code=400,
            detail="Share deployments do not support runSnapshotMode=never.",
        )
    listener_config: ShareDeploymentListenerConfig | None = None
    if x.listenerEntrypoint:
        listener_config = _copy_listener_entrypoint(
            x.listenerEntrypoint,
            deployment_root,
            enabled=x.listenerEnabled,
        )

    snapshot = project_state_backend.model_copy(deep=True)
    snapshot.defaultProjectConfigId = x.projectConfigId
    snapshot = _ensure_snapshot_view_modes(snapshot)
    _rebase_project_state_paths(snapshot, deployment_root)
    json_source_payloads = build_json_source_dicts(snapshot)
    for filename, data in json_source_payloads.items():
        target_path = _resolve_deployment_relative_path(filename, deployment_root)
        write_json_source_payload(target_path, data, state.dbe)

    manifest = ShareDeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        defaultProjectConfigId=x.projectConfigId,
        deploymentVersion=deployment_version,
        listener=listener_config,
    )
    state.dbe.write_json(deployment_root / "project.json", snapshot.model_dump())
    state.dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    state.dbe.write_json(deployment_root / "share_policy.json", policy.model_dump())

    logger.info(
        "Published share deployment %s for %s",
        deployment_version,
        deployment_name,
    )
    return ShareDeploymentMetadata(
        deploymentName=deployment_name,
        deploymentVersion=deployment_version,
        defaultProjectConfigId=x.projectConfigId,
        defaultProjectConfigName=project_config.name,
        createdAt=manifest.createdAt,
        deploymentRoot=deployment_root,
        sharePolicyPath=deployment_root / "share_policy.json",
    )
