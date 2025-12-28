import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, Request
from pydantic import BaseModel

from setta.logging.project_id_route import require_project_context
from setta.project_state.project_manager_types import (
    ProjectStateSingleConfigWithCompletedOpIds,
)
from setta.routers.dependencies import (
    ReadyAppStateFromRequest as AppStateFromRequest,
)
from setta.routers.dependencies import (
    get_share_session_id_from_request,
)
from setta.routers.setta_api_router import SettaProjectContextAPIRouter
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.helpers_lvl1 import get_variant_base_and_effective_section_impl
from setta.types.id import ID
from setta.types.routes import Route
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    ChartSectionImpl,
    CodeFileBinding,
    DrawSectionImpl,
    ImageSectionImpl,
)
from setta.types.share_deployment import (
    ListenerIsolationMode,
    ShareDeploymentListenerConfig,
    ShareDeploymentManifest,
    ShareDeploymentMetadata,
    ShareDeploymentSessionResponse,
    SharePolicy,
)
from setta.utils.constants import CWD, C
from setta.utils.timestamps import get_now_timestamp, timestamp_to_filename
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
    allowMCP: bool | None = None
    listenerIsolation: ListenerIsolationMode | None = None
    allowedSections: list[ID] | None = None


class PublishShareDeploymentRequest(BaseModel, extra="forbid"):
    projectConfigId: ID
    sharePolicyOverrides: SharePolicyOverrides | None = None
    listenerEntrypoint: str | None = None
    listenerEnabled: bool = True
    listenerIsolation: ListenerIsolationMode | None = None


def _create_deployment_root(project_config_id: ID) -> tuple[str, Path]:
    timestamp = timestamp_to_filename(get_now_timestamp())
    base_id = f"{project_config_id}_{timestamp}"
    deployment_id = base_id
    deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / deployment_id)
    counter = 1
    while deployment_root.exists():
        deployment_id = f"{base_id}_{counter}"
        deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / deployment_id)
        counter += 1
    deployment_root.mkdir(parents=True, exist_ok=False)
    return deployment_id, deployment_root


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


def _copy_artifact_path(
    path_str: str, artifacts_root: Path, path_map: dict[str, str]
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = _resolve_source_path(path_str)
    target_path = _artifact_target_path(source_path, artifacts_root)
    _copy_file(source_path, target_path)
    rebased = normalize_path(target_path).as_posix()
    path_map[path_str] = rebased
    return rebased


def _copy_json_source_path(
    path_str: str, json_root: Path, path_map: dict[str, str]
) -> str:
    if not path_str:
        return path_str
    if path_str in path_map:
        return path_map[path_str]
    source_path = _resolve_source_path(path_str)
    target_path = _json_source_target_path(source_path, json_root)
    _copy_file(source_path, target_path)
    rebased = normalize_path(target_path).as_posix()
    path_map[path_str] = rebased
    return rebased


def _copy_code_file_binding(
    binding: CodeFileBinding,
    code_root: Path,
    path_map: dict[str, CodeFileBinding],
) -> CodeFileBinding:
    path_key = str(binding.canonical_path)
    existing = path_map.get(path_key)
    if existing:
        return existing
    source_path = _resolve_source_path(path_key)
    target_path = _code_target_path(source_path, code_root)
    _copy_file(source_path, target_path)
    new_binding = CodeFileBinding(
        canonical_path=normalize_path(target_path),
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


def _expected_share_deployment_id(state: AppStateFromRequest) -> str:
    if state.share_deployment_root is None:
        raise HTTPException(
            status_code=400,
            detail="Share deployment root is not configured.",
        )
    if C.SHARE_DEPLOYMENT_ID:
        return C.SHARE_DEPLOYMENT_ID
    return state.share_deployment_root.name


def _require_matching_deployment_id(
    state: AppStateFromRequest, deployment_id: str
) -> None:
    expected_id = _expected_share_deployment_id(state)
    if deployment_id != expected_id:
        raise HTTPException(
            status_code=404,
            detail=f"Share deployment not found: {deployment_id}",
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

    for section in project_state.sections.values():
        for variant_id in section.variants:
            variant, base_impl, impl = get_variant_base_and_effective_section_impl(
                project_state, section, variant_id
            )

            if isinstance(impl, ImageSectionImpl) and impl.imagePath:
                new_path = _copy_artifact_path(
                    impl.imagePath, artifacts_root, artifact_path_map
                )
                if new_path != impl.imagePath:
                    set_effective_impl_value(
                        base_impl, section, variant, {"imagePath": new_path}
                    )

            if isinstance(impl, ChartSectionImpl) and impl.dataPath:
                new_path = _copy_artifact_path(
                    impl.dataPath, artifacts_root, artifact_path_map
                )
                if new_path != impl.dataPath:
                    set_effective_impl_value(
                        base_impl, section, variant, {"dataPath": new_path}
                    )

            if isinstance(impl, DrawSectionImpl) and impl.layers:
                updated_layers = []
                layers_changed = False
                for layer in impl.layers:
                    updated_elements = []
                    for element in layer.elements:
                        new_data_path = _copy_artifact_path(
                            element.dataPath, artifacts_root, artifact_path_map
                        )
                        new_transform_id = _copy_artifact_path(
                            element.transformId, artifacts_root, artifact_path_map
                        )
                        if (
                            new_data_path != element.dataPath
                            or new_transform_id != element.transformId
                        ):
                            layers_changed = True
                            updated_elements.append(
                                element.model_copy(
                                    update={
                                        "dataPath": new_data_path,
                                        "transformId": new_transform_id,
                                    }
                                )
                            )
                        else:
                            updated_elements.append(element)
                    if layers_changed:
                        updated_layers.append(
                            layer.model_copy(update={"elements": updated_elements})
                        )
                    else:
                        updated_layers.append(layer)
                if layers_changed:
                    set_effective_impl_value(
                        base_impl, section, variant, {"layers": updated_layers}
                    )

            if isinstance(impl, BaseCodeSectionImpl) and impl.codeFileBinding:
                updated_binding = _copy_code_file_binding(
                    impl.codeFileBinding, code_root, code_path_map
                )
                if updated_binding != impl.codeFileBinding:
                    set_effective_impl_value(
                        base_impl,
                        section,
                        variant,
                        {"codeFileBinding": updated_binding},
                    )

            if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                new_name = _copy_json_source_path(
                    variant.name, json_root, json_path_map
                )
                if new_name != variant.name:
                    variant.name = new_name


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


@router.get(Route.SHARE_DEPLOYMENTS)
def route_list_share_deployments() -> list[ShareDeploymentMetadata]:
    deployments_root = C.SHARE_DEPLOYMENTS_FOLDER
    if not deployments_root.exists():
        return []
    deployments: list[ShareDeploymentMetadata] = []
    for entry in sorted(deployments_root.iterdir()):
        if not entry.is_dir():
            continue
        deployments.append(
            ShareDeploymentMetadata(
                deploymentId=entry.name,
                deploymentRoot=normalize_path(entry),
                sharePolicyPath=normalize_path(entry / "share_policy.json"),
            )
        )
    return deployments


@router.post(Route.SHARE_DEPLOYMENT_SESSION)
async def route_create_share_session(
    deploymentId: str,
    state: AppStateFromRequest,
) -> ShareDeploymentSessionResponse:
    _require_share_mode(state)
    _require_matching_deployment_id(state, deploymentId)
    session = state.share_session_store.create_session()
    state.share_project_manager.create_session_state(session.id)
    return ShareDeploymentSessionResponse(
        deploymentId=deploymentId,
        shareSessionId=session.id,
        projectConfigId=state.share_project_manager.project_config_id,
        sharePolicy=state.share_project_manager.share_policy,
        manifest=state.share_project_manager.manifest,
    )


@router.get(Route.SHARE_DEPLOYMENT_STATE)
async def route_get_share_deployment_state(
    deploymentId: str,
    state: AppStateFromRequest,
    request: Request,
) -> ProjectStateSingleConfigWithCompletedOpIds:
    _require_share_mode(state)
    _require_matching_deployment_id(state, deploymentId)
    try:
        share_session_id = get_share_session_id_from_request(request)
    except KeyError as exc:
        raise HTTPException(
            status_code=400,
            detail="Missing share session id.",
        ) from exc
    try:
        state.share_session_store.get_session(share_session_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc
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
    project_state_backend = state.dbe.read_project()
    if x.projectConfigId not in project_state_backend.projectConfigs:
        raise HTTPException(
            status_code=404, detail=f"Project config not found: {x.projectConfigId}"
        )

    project_manager = state.project_manager_switcher.get(x.projectConfigId)
    await project_manager.finish_pending_operations()
    project_manager._flush_code_files_for_all_configs()

    deployment_id, deployment_root = _create_deployment_root(x.projectConfigId)
    policy = _apply_share_policy_overrides(x.sharePolicyOverrides, x.listenerIsolation)
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
        listener=listener_config,
    )
    state.dbe.write_json(deployment_root / "project.json", snapshot.model_dump())
    state.dbe.write_json(deployment_root / "manifest.json", manifest.model_dump())
    state.dbe.write_json(deployment_root / "share_policy.json", policy.model_dump())

    logger.info(
        "Published share deployment %s for project %s",
        deployment_id,
        x.projectConfigId,
    )
    return ShareDeploymentMetadata(
        deploymentId=deployment_id,
        deploymentRoot=deployment_root,
        sharePolicyPath=deployment_root / "share_policy.json",
    )
