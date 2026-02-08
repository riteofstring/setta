import logging
from pathlib import Path

from fastapi import HTTPException, Request, status
from pydantic import BaseModel

from setta.deployments.publish_utils import (
    copy_listener_entrypoint,
    create_deployment_root,
    ensure_snapshot_view_modes,
    normalize_deployment_name,
    rebase_project_state_paths,
    resolve_deployment_relative_path,
)
from setta.deployments.router_utils import (
    deployment_metadata_kwargs_from_manifest,
    get_latest_deployment_metadata_from_disk,
    get_or_create_share_session_id,
    list_deployment_versions_metadata,
    list_deployments_metadata,
)
from setta.logging.project_id_route import require_project_context
from setta.project_state.jsonSource.save import build_json_source_dicts
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.project_state.secret_values import strip_password_values
from setta.routers.dependencies import (
    ReadyAppStateFromRequest as AppStateFromRequest,
)
from setta.routers.dependencies import (
    maybe_get_share_session_id_from_request,
    require_share_session_id,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.id import ID
from setta.types.routes import Route
from setta.types.settings_state import RunSnapshotMode
from setta.types.share_deployment import (
    DeploymentListenerConfig,
    DeploymentManifest,
    DeploymentType,
    ShareDeploymentMetadata,
    ShareDeploymentSessionResponse,
    SharePolicy,
)
from setta.utils.structured_data import write_json_source_payload

logger = logging.getLogger(__name__)

router = SettaProjectContextAPIRouter()


class SharePolicyOverrides(BaseModel, extra="forbid"):
    allowParamChanges: bool | None = None
    allowVariantChanges: bool | None = None
    allowLayoutChanges: bool | None = None
    allowRun: bool | None = None
    allowLLM: bool | None = None
    allowExternalLinks: bool | None = None
    allowFileDownloads: bool | None = None
    allowMultipleRuns: bool | None = None
    runSnapshotMode: RunSnapshotMode | None = None


class PublishShareDeploymentRequest(BaseModel, extra="forbid"):
    deploymentName: str
    projectConfigId: ID
    sharePolicyOverrides: SharePolicyOverrides | None = None
    listenerEntrypoint: str | None = None
    listenerEnabled: bool = True


class LoadShareProjectConfigRequest(BaseModel, extra="forbid"):
    projectConfigId: ID


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


def _metadata_from_manifest(
    manifest: DeploymentManifest,
    deployment_root: Path,
    default_project_config_name: str,
    *,
    redact_paths: bool = False,
) -> ShareDeploymentMetadata:
    return ShareDeploymentMetadata(
        **deployment_metadata_kwargs_from_manifest(
            manifest,
            deployment_root,
            default_project_config_name,
            redact_paths=redact_paths,
        )
    )


@router.get(Route.SHARE_DEPLOYMENTS)
def route_list_share_deployments(
    state: AppStateFromRequest,
) -> list[ShareDeploymentMetadata]:
    if state.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Deployment mode does not allow listing deployments.",
        )
    return list_deployments_metadata(
        DeploymentType.share,
        _metadata_from_manifest,
        sort_key=lambda item: item.createdAt,
        sort_reverse=True,
    )


@router.get(Route.SHARE_DEPLOYMENT_VERSIONS)
def route_list_share_deployment_versions(
    deploymentName: str,
    state: AppStateFromRequest,
) -> list[ShareDeploymentMetadata]:
    if state.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Deployment mode does not allow listing deployment versions.",
        )
    return list_deployment_versions_metadata(
        deploymentName,
        DeploymentType.share,
        _metadata_from_manifest,
    )


@router.get(Route.SHARE_DEPLOYMENT_LATEST)
def route_get_latest_share_deployment(
    deploymentName: str,
    state: AppStateFromRequest,
) -> ShareDeploymentMetadata:
    deployment_name = normalize_deployment_name(deploymentName)
    if state.deployment_mode and not state.share_mode:
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deployment_name}",
        )
    if state.share_mode:
        expected_name = state.share_runtime_state.deployment_name
        if deployment_name != expected_name:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deployment_name}",
            )
        manifest = state.share_runtime_state.manifest
        if manifest is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deployment_name}",
            )
        if manifest.deploymentType is not DeploymentType.share:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deployment_name}",
            )
        if state.share_deployment_root is None:
            raise HTTPException(
                status_code=404,
                detail=f"Share deployment not found: {deployment_name}",
            )
        return _metadata_from_manifest(
            manifest,
            state.share_deployment_root,
            state.share_runtime_state.default_project_config_name,
            redact_paths=True,
        )
    return get_latest_deployment_metadata_from_disk(
        deployment_name,
        DeploymentType.share,
        _metadata_from_manifest,
        not_found_label="Share deployment",
    )


@router.post(Route.SHARE_DEPLOYMENT_CURRENT_SESSION)
async def route_create_share_session_current(
    request: Request,
    state: AppStateFromRequest,
) -> ShareDeploymentSessionResponse:
    _require_share_mode(state)
    share_session_id = get_or_create_share_session_id(state, request)
    return ShareDeploymentSessionResponse(
        deploymentName=state.share_runtime_state.deployment_name,
        deploymentVersion=state.share_runtime_state.deployment_version,
        shareSessionId=share_session_id,
        sessionRunCount=state.share_runtime_state.get_session_run_count(
            share_session_id
        ),
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
    share_session_id = get_or_create_share_session_id(state, request)
    return ShareDeploymentSessionResponse(
        deploymentName=state.share_runtime_state.deployment_name,
        deploymentVersion=state.share_runtime_state.deployment_version,
        shareSessionId=share_session_id,
        sessionRunCount=state.share_runtime_state.get_session_run_count(
            share_session_id
        ),
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
    if state.deployment_mode:
        raise HTTPException(
            status_code=403,
            detail="Deployment mode does not allow publishing deployments.",
        )
    project_manager = state.project_manager_switcher.get(x.projectConfigId)
    await project_manager.finish_pending_operations()
    project_manager.flush_code_files_for_all_configs()
    project_state_backend = project_manager.project_state_backend
    if x.projectConfigId not in project_state_backend.projectConfigs:
        raise HTTPException(
            status_code=404, detail=f"Project config not found: {x.projectConfigId}"
        )

    project_config = project_state_backend.projectConfigs[x.projectConfigId]
    deployment_name = normalize_deployment_name(x.deploymentName)
    deployment_version, deployment_root = create_deployment_root(deployment_name)
    policy = _apply_share_policy_overrides(x.sharePolicyOverrides)
    if policy.runSnapshotMode == RunSnapshotMode.never:
        raise HTTPException(
            status_code=400,
            detail="Share deployments do not support runSnapshotMode=never.",
        )
    listener_config: DeploymentListenerConfig | None = None
    if x.listenerEntrypoint:
        listener_config = copy_listener_entrypoint(
            x.listenerEntrypoint,
            deployment_root,
            enabled=x.listenerEnabled,
        )

    snapshot = project_state_backend.model_copy(deep=True)
    snapshot.defaultProjectConfigId = x.projectConfigId
    snapshot = ensure_snapshot_view_modes(snapshot)
    rebase_project_state_paths(snapshot, deployment_root)
    strip_password_values(snapshot, force_has_secret=False)
    json_source_payloads = build_json_source_dicts(snapshot)
    for filename, data in json_source_payloads.items():
        target_path = resolve_deployment_relative_path(filename, deployment_root)
        write_json_source_payload(target_path, data, state.dbe)

    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=x.projectConfigId,
        deploymentVersion=deployment_version,
        listener=listener_config,
    )
    state.dbe.write_json(deployment_root / "project.json", snapshot.model_dump())
    state.dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    state.dbe.write_json(deployment_root / "policy.json", policy.model_dump())

    listener_label = (
        f"{listener_config.entrypoint} (enabled={listener_config.enabled})"
        if listener_config is not None
        else "-"
    )
    logger.info(
        "Published share deployment %s for %s (listener=%s)",
        deployment_version,
        deployment_name,
        listener_label,
    )
    return ShareDeploymentMetadata(
        deploymentName=deployment_name,
        deploymentVersion=deployment_version,
        defaultProjectConfigId=x.projectConfigId,
        defaultProjectConfigName=project_config.name,
        createdAt=manifest.createdAt,
        deploymentRoot=deployment_root,
        policyPath=deployment_root / "policy.json",
    )
