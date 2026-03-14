from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, TypeVar

from fastapi import HTTPException, Request, status

from setta.database.db_objs import DBE
from setta.deployments.deployment_utils import iter_deployment_versions
from setta.deployments.publish_utils import (
    manifest_matches_root,
    normalize_deployment_name,
    resolve_default_project_config,
)
from setta.routers.dependencies import maybe_get_share_session_id_from_request
from setta.types.share_deployment import DeploymentManifest, DeploymentType
from setta.utils.constants import C
from setta.utils.utils import normalize_path

if TYPE_CHECKING:
    from setta.routers.dependencies import ReadyAppStateFromRequest

T = TypeVar("T")


def deployment_metadata_kwargs_from_manifest(
    manifest: DeploymentManifest,
    deployment_root: Path,
    default_project_config_name: str,
    *,
    redact_paths: bool = False,
) -> dict[str, object]:
    if redact_paths:
        redacted = Path("redacted")
        deployment_root_value: Path = redacted
        policy_path_value: Path = redacted
    else:
        deployment_root_value = normalize_path(deployment_root)
        policy_path_value = normalize_path(deployment_root / "policy.json")
    return {
        "deploymentName": manifest.deploymentName,
        "deploymentVersion": manifest.deploymentVersion,
        "defaultProjectConfigId": manifest.defaultProjectConfigId,
        "defaultProjectConfigName": default_project_config_name,
        "createdAt": manifest.createdAt,
        "deploymentRoot": deployment_root_value,
        "policyPath": policy_path_value,
    }


def list_deployments_metadata(
    deployment_type: DeploymentType,
    metadata_factory: Callable[[DeploymentManifest, Path, str], T],
    *,
    sort_key: Callable[[T], object] | None = None,
    sort_reverse: bool = False,
) -> list[T]:
    deployments_root = C.SHARE_DEPLOYMENTS_FOLDER
    if not deployments_root.exists():
        return []
    deployments: list[T] = []
    for deployment_root in sorted(deployments_root.iterdir()):
        if not deployment_root.is_dir():
            continue
        for _, version_root in iter_deployment_versions(deployment_root):
            manifest = DBE(version_root).read_deployment_manifest_optional()
            if manifest is None:
                continue
            if manifest.deploymentType is not deployment_type:
                continue
            if not manifest_matches_root(manifest, version_root):
                continue
            default_config = resolve_default_project_config(manifest, version_root)
            if default_config is None:
                continue
            deployments.append(
                metadata_factory(
                    manifest,
                    version_root,
                    default_config.name,
                )
            )
    if sort_key is not None:
        deployments.sort(key=sort_key, reverse=sort_reverse)
    return deployments


def list_deployment_versions_metadata(
    deployment_name: str,
    deployment_type: DeploymentType,
    metadata_factory: Callable[[DeploymentManifest, Path, str], T],
) -> list[T]:
    normalized_name = normalize_deployment_name(deployment_name)
    deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / normalized_name)
    if not deployment_root.exists():
        return []
    versions = sorted(
        iter_deployment_versions(deployment_root),
        key=lambda item: item[0],
        reverse=True,
    )
    deployments: list[T] = []
    for _, version_root in versions:
        manifest = DBE(version_root).read_deployment_manifest_optional()
        if manifest is None:
            continue
        if manifest.deploymentType is not deployment_type:
            continue
        if not manifest_matches_root(manifest, version_root):
            continue
        default_config = resolve_default_project_config(manifest, version_root)
        if default_config is None:
            continue
        deployments.append(
            metadata_factory(
                manifest,
                version_root,
                default_config.name,
            )
        )
    return deployments


def get_latest_deployment_metadata_from_disk(
    deployment_name: str,
    deployment_type: DeploymentType,
    metadata_factory: Callable[[DeploymentManifest, Path, str], T],
    *,
    not_found_label: str,
) -> T:
    normalized_name = normalize_deployment_name(deployment_name)
    deployment_root = normalize_path(C.SHARE_DEPLOYMENTS_FOLDER / normalized_name)
    not_found_detail = f"{not_found_label} not found: {normalized_name}"
    if not deployment_root.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )
    versions = iter_deployment_versions(deployment_root)
    if not versions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )
    _, latest_root = max(versions, key=lambda item: item[0])
    manifest = DBE(latest_root).read_deployment_manifest_optional()
    if manifest is None or not manifest_matches_root(manifest, latest_root):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )
    if manifest.deploymentType is not deployment_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )
    default_config = resolve_default_project_config(manifest, latest_root)
    if default_config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=not_found_detail,
        )
    return metadata_factory(
        manifest,
        latest_root,
        default_config.name,
    )


def get_or_create_share_session_id(
    state: "ReadyAppStateFromRequest",
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
