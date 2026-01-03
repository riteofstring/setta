import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, Request, status
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
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
    read_share_deployment_manifest,
    rewrite_project_state_paths,
)
from setta.types.id import ID
from setta.types.routes import Route
from setta.types.section_impls import (
    CodeFileBinding,
)
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import (
    ListenerIsolationMode,
    ShareDeploymentListenerConfig,
    ShareDeploymentManifest,
    ShareDeploymentMetadata,
    ShareDeploymentSessionResponse,
    SharePolicy,
)
from setta.utils.constants import CWD, C
from setta.utils.utils import compute_md5_prefix, normalize_path

logger = logging.getLogger(__name__)

router = SettaProjectContextAPIRouter()

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateBackend


class SharePolicyOverrides(BaseModel, extra="forbid"):
    allowParamChanges: bool | None = None
    allowVariantChanges: bool | None = None
    allowLayoutChanges: bool | None = None
    allowStructuralChanges: bool | None = None
    allowRun: bool | None = None
    allowLLM: bool | None = None
    allowMCP: bool | None = None
    runSnapshotMode: RunSnapshotMode | None = None
    listenerIsolation: ListenerIsolationMode | None = None
    allowedSections: list[ID] | None = None


class PublishShareDeploymentRequest(BaseModel, extra="forbid"):
    projectConfigId: ID
    sharePolicyOverrides: SharePolicyOverrides | None = None
    listenerEntrypoint: str | None = None
    listenerEnabled: bool = True
    listenerIsolation: ListenerIsolationMode | None = None


def _create_deployment_root(project_config_name: str) -> tuple[str, Path]:
    project_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / project_config_name)
    project_root.mkdir(parents=True, exist_ok=True)
    version_numbers = [
        number for number, _ in iter_share_deployment_versions(project_root)
    ]
    next_number = max(version_numbers, default=0) + 1
    deployment_version = f"v{next_number}"
    deployment_root = normalize_path(project_root / deployment_version)
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
    _copy_file(source_path, target_path)
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
    listener_isolation: ListenerIsolationMode | None,
) -> SharePolicy:
    policy = SharePolicy()
    if overrides:
        policy = policy.model_copy(update=overrides.model_dump(exclude_none=True))
    if listener_isolation is not None:
        policy.listenerIsolation = listener_isolation
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
        state.share_project_manager.project_config_name,
        state.share_project_manager.deployment_version,
    )


def _require_matching_deployment(
    state: AppStateFromRequest,
    project_config_name: str,
    version: str,
) -> None:
    expected_name, expected_version = _expected_share_deployment(state)
    if project_config_name != expected_name or version != expected_version:
        raise HTTPException(
            status_code=404,
            detail=(f"Share deployment not found: {project_config_name}/{version}"),
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


def _copy_listener_entrypoint(
    source_path: str,
    deployment_root: Path,
    policy: SharePolicy,
    *,
    enabled: bool,
    isolation: ListenerIsolationMode | None,
) -> ShareDeploymentListenerConfig:
    listener_root = deployment_root / "listener"
    target_path = listener_root / "app.py"
    _copy_file(_resolve_source_path(source_path), target_path)
    listener_isolation = isolation or policy.listenerIsolation
    return ShareDeploymentListenerConfig(
        entrypoint=Path("listener/app.py").as_posix(),
        enabled=enabled,
        isolation=listener_isolation,
    )


def _manifest_matches_root(
    manifest: ShareDeploymentManifest, deployment_root: Path
) -> bool:
    if deployment_root.name != manifest.deploymentVersion:
        return False
    if deployment_root.parent.name != manifest.projectConfigName:
        return False
    return True


def _metadata_from_manifest(
    manifest: ShareDeploymentManifest,
    deployment_root: Path,
    *,
    redact_paths: bool = False,
) -> ShareDeploymentMetadata:
    if redact_paths:
        redacted = Path("redacted")
        return ShareDeploymentMetadata(
            projectConfigName=manifest.projectConfigName,
            deploymentVersion=manifest.deploymentVersion,
            createdAt=manifest.createdAt,
            deploymentRoot=redacted,
            sharePolicyPath=redacted,
        )
    return ShareDeploymentMetadata(
        projectConfigName=manifest.projectConfigName,
        deploymentVersion=manifest.deploymentVersion,
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
    for project_root in sorted(deployments_root.iterdir()):
        if not project_root.is_dir():
            continue
        for _, version_root in iter_share_deployment_versions(project_root):
            manifest = read_share_deployment_manifest(version_root)
            if manifest is None:
                continue
            if not _manifest_matches_root(manifest, version_root):
                continue
            deployments.append(_metadata_from_manifest(manifest, version_root))
    deployments.sort(key=lambda item: item.createdAt, reverse=True)
    return deployments


@router.get(Route.SHARE_DEPLOYMENT_VERSIONS)
def route_list_share_deployment_versions(
    projectConfigName: str,
    state: AppStateFromRequest,
) -> list[ShareDeploymentMetadata]:
    if state.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share mode does not allow listing deployment versions.",
        )
    project_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / projectConfigName)
    if not project_root.exists():
        return []
    versions = sorted(
        iter_share_deployment_versions(project_root),
        key=lambda item: item[0],
        reverse=True,
    )
    deployments: list[ShareDeploymentMetadata] = []
    for _, version_root in versions:
        manifest = read_share_deployment_manifest(version_root)
        if manifest is None:
            continue
        if not _manifest_matches_root(manifest, version_root):
            continue
        deployments.append(_metadata_from_manifest(manifest, version_root))
    return deployments


@router.get(Route.SHARE_DEPLOYMENT_LATEST)
def route_get_latest_share_deployment(
    projectConfigName: str,
    state: AppStateFromRequest,
) -> ShareDeploymentMetadata:
    if state.share_mode:
        expected_name = state.share_project_manager.project_config_name
        if projectConfigName != expected_name:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {projectConfigName}",
            )
        manifest = state.share_project_manager.manifest
        if manifest is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {projectConfigName}",
            )
        if state.share_deployment_root is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {projectConfigName}",
            )
        return _metadata_from_manifest(
            manifest,
            state.share_deployment_root,
            redact_paths=True,
        )
    project_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / projectConfigName)
    if not project_root.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {projectConfigName}",
        )
    versions = iter_share_deployment_versions(project_root)
    if not versions:
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {projectConfigName}",
        )
    _, latest_root = max(versions, key=lambda item: item[0])
    manifest = read_share_deployment_manifest(latest_root)
    if manifest is None or not _manifest_matches_root(manifest, latest_root):
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {projectConfigName}",
        )
    return _metadata_from_manifest(manifest, latest_root)


@router.post(Route.SHARE_DEPLOYMENT_SESSION)
async def route_create_share_session(
    projectConfigName: str,
    version: str,
    state: AppStateFromRequest,
) -> ShareDeploymentSessionResponse:
    _require_share_mode(state)
    _require_matching_deployment(state, projectConfigName, version)
    session = state.share_session_store.create_session()
    state.share_project_manager.create_session_state(session.id)
    return ShareDeploymentSessionResponse(
        projectConfigName=state.share_project_manager.project_config_name,
        deploymentVersion=state.share_project_manager.deployment_version,
        shareSessionId=session.id,
        projectConfigId=state.share_project_manager.project_config_id,
        sharePolicy=state.share_project_manager.share_policy,
        manifest=state.share_project_manager.manifest,
    )


@router.get(Route.SHARE_DEPLOYMENT_STATE)
async def route_get_share_deployment_state(
    projectConfigName: str,
    version: str,
    state: AppStateFromRequest,
    request: Request,
) -> ProjectStateSingleConfigWithCompletedOpIds:
    _require_share_mode(state)
    _require_matching_deployment(state, projectConfigName, version)
    share_session_id = require_share_session_id(
        state,
        maybe_get_share_session_id_from_request(request),
        create_session_state=False,
    )
    project_state = state.share_project_manager.get_or_create_session_state(
        share_session_id
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
    deployment_version, deployment_root = _create_deployment_root(project_config.name)
    policy = _apply_share_policy_overrides(x.sharePolicyOverrides, x.listenerIsolation)
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
            policy,
            enabled=x.listenerEnabled,
            isolation=x.listenerIsolation,
        )

    snapshot = project_state_backend.model_copy(deep=True)
    _rebase_project_state_paths(snapshot, deployment_root)

    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=x.projectConfigId,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
        listener=listener_config,
    )
    state.dbe.write_json(deployment_root / "project.json", snapshot.model_dump())
    state.dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    state.dbe.write_json(deployment_root / "share_policy.json", policy.model_dump())

    logger.info(
        "Published share deployment %s for project %s",
        deployment_version,
        x.projectConfigId,
    )
    return ShareDeploymentMetadata(
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
        createdAt=manifest.createdAt,
        deploymentRoot=deployment_root,
        sharePolicyPath=deployment_root / "share_policy.json",
    )
