import os
import signal
from pathlib import Path
from typing import Literal

from fastapi import Body, Depends, Request
from pydantic import BaseModel, Field

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.auth.session import load_current_session_secret
from setta.launch import LaunchError, launch_workspace_session
from setta.launcher_metadata import (
    LauncherMetadataError,
    update_launcher_last_used_workspace_if_installed,
)
from setta.launcher_workspace_store import (
    LauncherWorkspaceEntry,
    LauncherWorkspaceStoreError,
    launcher_allowed_roots,
    load_recent_workspaces,
    remove_recent_workspace,
    resolve_launcher_path_within_allowed_roots,
    set_recent_workspace_pinned,
    upsert_recent_workspace,
)
from setta.routers.dependencies import (
    AppStateFromRequest,
    require_launcher_mode,
    require_not_deployment_mode,
)
from setta.routers.launcher_scope import resolve_launcher_setta_home
from setta.routers.setta_api_router import SettaAPIRouter
from setta.ssh_common import normalize_optional_argument
from setta.trusted_frontend_origins import TrustedFrontendOriginStoreError
from setta.types.routes import Route
from setta.utils.launch_request import normalize_setta_files_location_for_launch
from setta.utils.launcher_handoff_trust import (
    trust_launched_workspace_origin_for_launcher_session,
)
from setta.utils.launcher_origin_handoff import (
    append_launcher_origin_handoff_to_bootstrap_url,
    mint_launcher_origin_handoff_proof,
    normalize_launcher_origin,
)
from setta.utils.network import build_bootstrap_urls

router = SettaAPIRouter(
    dependencies=[Depends(require_not_deployment_mode), Depends(require_launcher_mode)]
)
_MAX_DIRECTORY_ENTRIES = 500
_MAX_DIRECTORY_SCAN_ENTRIES = 5000
_MAX_DIRECTORY_CURSOR_OFFSET = 5000


class LauncherHomeErrorPayload(BaseModel):
    code: str
    message: str


class LauncherAppModeResponse(BaseModel):
    launcherMode: bool


class LauncherRecentWorkspacePayload(BaseModel):
    workspaceRoot: str
    pinned: bool
    lastUsedAt: int


class LauncherRecentWorkspacesResponse(BaseModel):
    ok: bool
    workspaces: list[LauncherRecentWorkspacePayload] = Field(default_factory=list)
    error: LauncherHomeErrorPayload | None = None


class LauncherRecentWorkspaceRequest(BaseModel):
    settaHome: str | None = None
    workspaceRoot: str
    pinned: bool | None = None


class PinLauncherRecentWorkspaceRequest(BaseModel):
    settaHome: str | None = None
    workspaceRoot: str
    pinned: bool


class LauncherFilesystemRootsResponse(BaseModel):
    ok: bool
    roots: list[str] = Field(default_factory=list)


class LauncherDirectoryEntryPayload(BaseModel):
    name: str
    path: str
    isDirectory: bool
    isSymlink: bool


class LauncherListDirectoryRequest(BaseModel):
    path: str | None = None
    cursor: str | None = None
    pageSize: int | None = None


class LauncherListDirectoryResponse(BaseModel):
    ok: bool
    currentPath: str | None = None
    parentPath: str | None = None
    entries: list[LauncherDirectoryEntryPayload] = Field(default_factory=list)
    nextCursor: str | None = None
    hasMore: bool = False
    truncated: bool = False
    error: LauncherHomeErrorPayload | None = None


class LauncherOpenWorkspaceRequest(BaseModel):
    workspaceRoot: str
    settaHome: str | None = None
    profile: str | None = None
    settaFilesRoot: str | None = None
    settaFilesLocation: Literal["auto", "local", "global"] | None = None
    runtimeRoot: str | None = None
    createIfMissing: bool = False


class LauncherOpenWorkspaceResponse(BaseModel):
    ok: bool
    bootstrapUrlFragment: str | None = None
    workspaceRoot: str | None = None
    settaFilesLocation: Literal["local", "global"] | None = None
    settaFilesRoot: str | None = None
    runtimeRoot: str | None = None
    settaHome: str | None = None
    profile: str | None = None
    sessionId: str | None = None
    startedNew: bool | None = None
    error: LauncherHomeErrorPayload | None = None


@router.get(Route.GET_LAUNCHER_APP_MODE)
def route_get_launcher_app_mode(state: AppStateFromRequest) -> LauncherAppModeResponse:
    return LauncherAppModeResponse(launcherMode=state.launcher_mode)


@router.get(Route.GET_LAUNCHER_RECENT_WORKSPACES)
def route_get_launcher_recent_workspaces(
    setta_home: str | None = None,
) -> LauncherRecentWorkspacesResponse:
    resolved_setta_home = resolve_launcher_setta_home(setta_home=setta_home)
    try:
        workspaces = load_recent_workspaces(setta_home=resolved_setta_home)
    except LauncherWorkspaceStoreError as exc:
        return _launcher_recent_workspaces_error(exc)
    return LauncherRecentWorkspacesResponse(
        ok=True,
        workspaces=_workspace_payloads(workspaces),
    )


@router.post(Route.ADD_LAUNCHER_RECENT_WORKSPACE)
def route_add_launcher_recent_workspace(
    x: LauncherRecentWorkspaceRequest,
) -> LauncherRecentWorkspacesResponse:
    resolved_setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    allowed_roots = launcher_allowed_roots()
    try:
        workspace_root = resolve_launcher_path_within_allowed_roots(
            raw_path=x.workspaceRoot,
            allowed_roots=allowed_roots,
            allow_nonexistent=True,
        )
        workspaces = upsert_recent_workspace(
            setta_home=resolved_setta_home,
            workspace_root=workspace_root,
            pinned=x.pinned,
        )
    except LauncherWorkspaceStoreError as exc:
        return _launcher_recent_workspaces_error(exc)
    return LauncherRecentWorkspacesResponse(
        ok=True,
        workspaces=_workspace_payloads(workspaces),
    )


@router.post(Route.REMOVE_LAUNCHER_RECENT_WORKSPACE)
def route_remove_launcher_recent_workspace(
    x: LauncherRecentWorkspaceRequest,
) -> LauncherRecentWorkspacesResponse:
    resolved_setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    allowed_roots = launcher_allowed_roots()
    try:
        workspace_root = resolve_launcher_path_within_allowed_roots(
            raw_path=x.workspaceRoot,
            allowed_roots=allowed_roots,
            allow_nonexistent=True,
        )
        workspaces = remove_recent_workspace(
            setta_home=resolved_setta_home,
            workspace_root=workspace_root,
        )
    except LauncherWorkspaceStoreError as exc:
        return _launcher_recent_workspaces_error(exc)
    return LauncherRecentWorkspacesResponse(
        ok=True,
        workspaces=_workspace_payloads(workspaces),
    )


@router.post(Route.PIN_LAUNCHER_RECENT_WORKSPACE)
def route_pin_launcher_recent_workspace(
    x: PinLauncherRecentWorkspaceRequest,
) -> LauncherRecentWorkspacesResponse:
    resolved_setta_home = resolve_launcher_setta_home(setta_home=x.settaHome)
    allowed_roots = launcher_allowed_roots()
    try:
        workspace_root = resolve_launcher_path_within_allowed_roots(
            raw_path=x.workspaceRoot,
            allowed_roots=allowed_roots,
            allow_nonexistent=True,
        )
        workspaces = set_recent_workspace_pinned(
            setta_home=resolved_setta_home,
            workspace_root=workspace_root,
            pinned=x.pinned,
        )
    except LauncherWorkspaceStoreError as exc:
        return _launcher_recent_workspaces_error(exc)
    return LauncherRecentWorkspacesResponse(
        ok=True,
        workspaces=_workspace_payloads(workspaces),
    )


@router.get(Route.GET_LAUNCHER_FILESYSTEM_ROOTS)
def route_get_launcher_filesystem_roots() -> LauncherFilesystemRootsResponse:
    roots = launcher_allowed_roots()
    return LauncherFilesystemRootsResponse(
        ok=True,
        roots=[str(path) for path in roots],
    )


@router.post(Route.LIST_LAUNCHER_DIRECTORY)
def route_list_launcher_directory(
    x: LauncherListDirectoryRequest = Body(
        default_factory=LauncherListDirectoryRequest
    ),
) -> LauncherListDirectoryResponse:
    allowed_roots = launcher_allowed_roots()
    if x.path is None or not x.path.strip():
        root_entries = [
            LauncherDirectoryEntryPayload(
                name=_path_display_name(root),
                path=str(root),
                isDirectory=True,
                isSymlink=root.is_symlink(),
            )
            for root in allowed_roots
        ]
        return LauncherListDirectoryResponse(
            ok=True,
            currentPath=None,
            parentPath=None,
            entries=root_entries,
            hasMore=False,
            nextCursor=None,
        )

    try:
        page_size = _normalize_directory_page_size(x.pageSize)
        cursor_offset = _normalize_directory_cursor(x.cursor)
    except ValueError as exc:
        return LauncherListDirectoryResponse(
            ok=False,
            error=LauncherHomeErrorPayload(code="BadRequest", message=str(exc)),
        )

    try:
        directory = resolve_launcher_path_within_allowed_roots(
            raw_path=x.path,
            allowed_roots=allowed_roots,
            allow_nonexistent=False,
        )
    except LauncherWorkspaceStoreError as exc:
        return LauncherListDirectoryResponse(
            ok=False,
            error=LauncherHomeErrorPayload(code=exc.code, message=str(exc)),
        )

    if not directory.is_dir():
        return LauncherListDirectoryResponse(
            ok=False,
            error=LauncherHomeErrorPayload(
                code="BadRequest",
                message=f"Path is not a directory: {directory}",
            ),
        )

    candidate_entries: list[LauncherDirectoryEntryPayload] = []
    has_more = False
    scan_budget_reached = False
    try:
        with os.scandir(directory) as children:
            for scanned_count, child in enumerate(children, start=1):
                if scanned_count > _MAX_DIRECTORY_SCAN_ENTRIES:
                    scan_budget_reached = True
                    break
                child_path = Path(child.path)
                resolved_child = child_path.resolve(strict=False)
                if not _is_within_roots(path=resolved_child, roots=allowed_roots):
                    continue
                candidate_entries.append(
                    LauncherDirectoryEntryPayload(
                        name=child.name,
                        path=str(resolved_child),
                        isDirectory=resolved_child.is_dir(),
                        isSymlink=child.is_symlink(),
                    )
                )
    except OSError as exc:
        return LauncherListDirectoryResponse(
            ok=False,
            error=LauncherHomeErrorPayload(
                code="DirectoryReadFailed",
                message=f"Failed to read directory {directory}: {exc}",
            ),
        )
    candidate_entries.sort(
        key=lambda entry: (
            not entry.isDirectory,
            entry.name.lower(),
        )
    )
    page_start = cursor_offset
    page_end = cursor_offset + page_size
    visible_entries = candidate_entries[page_start:page_end]
    if len(candidate_entries) > page_end:
        has_more = True
    next_cursor: str | None = None
    if has_more:
        next_cursor = str(cursor_offset + len(visible_entries))
    if scan_budget_reached and next_cursor is None:
        has_more = False

    parent_path: str | None = None
    parent = directory.parent.resolve(strict=False)
    if _is_within_roots(path=parent, roots=allowed_roots) and parent != directory:
        parent_path = str(parent)

    return LauncherListDirectoryResponse(
        ok=True,
        currentPath=str(directory),
        parentPath=parent_path,
        entries=visible_entries,
        hasMore=has_more,
        nextCursor=next_cursor,
        truncated=scan_budget_reached,
    )


def _normalize_directory_page_size(raw_page_size: int | None) -> int:
    if raw_page_size is None:
        return _MAX_DIRECTORY_ENTRIES
    if raw_page_size < 1:
        raise ValueError("pageSize must be at least 1.")
    if raw_page_size > _MAX_DIRECTORY_ENTRIES:
        raise ValueError(f"pageSize must be <= {_MAX_DIRECTORY_ENTRIES}.")
    return raw_page_size


def _normalize_directory_cursor(raw_cursor: str | None) -> int:
    if raw_cursor is None:
        return 0
    trimmed = raw_cursor.strip()
    if not trimmed:
        return 0
    if not trimmed.isdigit():
        raise ValueError("cursor must be a non-negative integer.")
    cursor_offset = int(trimmed)
    if cursor_offset > _MAX_DIRECTORY_CURSOR_OFFSET:
        raise ValueError(
            f"cursor offset exceeds maximum supported value ({_MAX_DIRECTORY_CURSOR_OFFSET})."
        )
    return cursor_offset


@router.post(Route.OPEN_LAUNCHER_WORKSPACE)
def route_open_launcher_workspace(
    request: Request,
    x: LauncherOpenWorkspaceRequest,
) -> LauncherOpenWorkspaceResponse:
    launcher_session_info = load_current_session_secret()
    normalized_profile = normalize_optional_argument(x.profile)
    normalized_setta_home = normalize_optional_argument(x.settaHome)
    normalized_setta_files_root = normalize_optional_argument(x.settaFilesRoot)
    normalized_runtime_root = normalize_optional_argument(x.runtimeRoot)
    resolved_setta_home = resolve_launcher_setta_home(setta_home=normalized_setta_home)

    if x.createIfMissing and _contains_dot_segments(raw_path=x.workspaceRoot):
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(
                code="BadRequest",
                message=(
                    "Workspace path must not contain '.' or '..' segments when "
                    "creating a new project."
                ),
            ),
        )

    allowed_roots = launcher_allowed_roots()
    try:
        workspace_root = resolve_launcher_path_within_allowed_roots(
            raw_path=x.workspaceRoot,
            allowed_roots=allowed_roots,
            allow_nonexistent=True,
        )
    except LauncherWorkspaceStoreError as exc:
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(code=exc.code, message=str(exc)),
        )

    if not workspace_root.exists():
        if not x.createIfMissing:
            return LauncherOpenWorkspaceResponse(
                ok=False,
                error=LauncherHomeErrorPayload(
                    code="PathNotFound",
                    message=f"Workspace root does not exist: {workspace_root}",
                ),
            )
        try:
            workspace_root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return LauncherOpenWorkspaceResponse(
                ok=False,
                error=LauncherHomeErrorPayload(
                    code="CreateWorkspaceFailed",
                    message=f"Failed to create workspace root {workspace_root}: {exc}",
                ),
            )

    if not workspace_root.is_dir():
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(
                code="BadRequest",
                message=f"Workspace root is not a directory: {workspace_root}",
            ),
        )

    normalized_setta_files_location = normalize_setta_files_location_for_launch(
        setta_files_location=x.settaFilesLocation,
        setta_files_location_provided="settaFilesLocation" in x.model_fields_set,
        setta_files_root=normalized_setta_files_root,
        profile=normalized_profile,
    )

    try:
        result = launch_workspace_session(
            workspace_root=workspace_root,
            profile=normalized_profile,
            setta_home=str(resolved_setta_home),
            setta_files_root=normalized_setta_files_root,
            setta_files_location=normalized_setta_files_location,
            runtime_root=normalized_runtime_root,
            allow_env_files_overrides=False,
            allow_env_non_files_overrides=False,
            server_mode="ide",
        )
    except LaunchError as exc:
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(code=exc.code, message=str(exc)),
        )
    except ValueError as exc:
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(code="BadRequest", message=str(exc)),
        )

    try:
        update_launcher_last_used_workspace_if_installed(
            setta_home=result.paths.setta_home,
            workspace_root=result.paths.workspace_root,
        )
    except (LauncherMetadataError, OSError):
        pass

    try:
        upsert_recent_workspace(
            setta_home=result.paths.setta_home,
            workspace_root=result.paths.workspace_root,
        )
    except LauncherWorkspaceStoreError:
        pass

    secret = result.registry.load_secret(result.session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(result.session.id, secret)
    bootstrap_url_fragment, _ = build_bootstrap_urls(
        result.session.host,
        result.session.port,
        token,
    )
    request_origin = normalize_launcher_origin(
        f"{request.url.scheme}://{request.url.netloc}"
    )
    if request_origin is not None:
        launcher_origin_proof = mint_launcher_origin_handoff_proof(
            session_id=result.session.id,
            launcher_origin=request_origin,
            secret=secret,
        )
        bootstrap_url_fragment = append_launcher_origin_handoff_to_bootstrap_url(
            bootstrap_url_fragment=bootstrap_url_fragment,
            launcher_origin=request_origin,
            proof=launcher_origin_proof,
        )
    try:
        trust_launched_workspace_origin_for_launcher_session(
            request_origin=request_origin,
            bootstrap_url_fragment=bootstrap_url_fragment,
            launcher_session_info=launcher_session_info,
        )
    except TrustedFrontendOriginStoreError as exc:
        if result.started_new:
            _rollback_started_workspace_session(
                session_id=result.session.id,
                pid=result.session.pid,
                registry=result.registry,
            )
        return LauncherOpenWorkspaceResponse(
            ok=False,
            error=LauncherHomeErrorPayload(
                code="TrustedFrontendOriginStoreUnavailable",
                message=str(exc),
            ),
        )

    return LauncherOpenWorkspaceResponse(
        ok=True,
        bootstrapUrlFragment=bootstrap_url_fragment,
        workspaceRoot=str(result.paths.workspace_root),
        settaFilesLocation=result.paths.setta_files_location,
        settaFilesRoot=str(result.paths.setta_files_root),
        runtimeRoot=str(result.paths.runtime_root),
        settaHome=str(result.paths.setta_home),
        profile=result.paths.profile_name,
        sessionId=result.session.id,
        startedNew=result.started_new,
    )


def _workspace_payloads(
    entries: list[LauncherWorkspaceEntry],
) -> list[LauncherRecentWorkspacePayload]:
    return [
        LauncherRecentWorkspacePayload(
            workspaceRoot=str(entry.workspace_root),
            pinned=entry.pinned,
            lastUsedAt=entry.last_used_at,
        )
        for entry in entries
    ]


def _launcher_recent_workspaces_error(
    exc: LauncherWorkspaceStoreError,
) -> LauncherRecentWorkspacesResponse:
    return LauncherRecentWorkspacesResponse(
        ok=False,
        error=LauncherHomeErrorPayload(code=exc.code, message=str(exc)),
    )


def _contains_dot_segments(*, raw_path: str) -> bool:
    normalized = raw_path.replace("\\", "/")
    for segment in normalized.split("/"):
        if segment in {".", ".."}:
            return True
    return False


def _is_within_roots(*, path: Path, roots: list[Path]) -> bool:
    for root in roots:
        if path.is_relative_to(root):
            return True
    return False


def _path_display_name(path: Path) -> str:
    drive = path.drive
    if drive:
        return drive
    return str(path)


def _rollback_started_workspace_session(
    *, session_id: str, pid: int, registry: object
) -> None:
    if pid > 0:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass

    try:
        delete_session = getattr(registry, "delete_session")
    except AttributeError:
        return
    try:
        delete_session(session_id)
    except OSError:
        pass
