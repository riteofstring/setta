import argparse
import importlib
import logging
import os
from io import BytesIO
from pathlib import Path

from setta.api import SettaListener
from setta.auth.manager import AUTH_COOKIE_MANAGER, BOOTSTRAP_TOKEN_MANAGER
from setta.binary import BinaryStore
from setta.logging.config import configure_listener_logging
from setta.sessions import SessionMetadata, SessionRegistry
from setta.types.artifact import ImageArtifact
from setta.types.binary_content import BinaryContentRef
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths

logger = logging.getLogger(__name__)

DEFAULT_DRAW_DEP_NAME = "the_drawing"
DEFAULT_IMAGE_ARTIFACT_ID = "reversed_image.png"


def _load_pillow_modules():
    image_module = importlib.import_module("PIL.Image")
    image_ops_module = importlib.import_module("PIL.ImageOps")
    return image_module, image_ops_module


def resolve_project_name(arg_value: str | None) -> str:
    if arg_value:
        return arg_value
    env_value = os.environ.get("SETTA_PROJECT_NAME")
    if env_value:
        return env_value
    raise ValueError(
        "Project name is required. Pass --project-name or set SETTA_PROJECT_NAME."
    )


def _resolve_session_metadata(
    session_id: str | None,
    sessions_root: Path | None,
) -> SessionMetadata | None:
    registry = SessionRegistry(sessions_root=sessions_root)
    if session_id:
        return registry.load_session(
            session_id,
            prune_stale=False,
            track_suspicious=False,
        )
    sessions = registry.find_sessions_by_workspace(
        get_setta_paths().workspace_root,
        prune_stale=False,
        track_suspicious=False,
    )
    if not sessions:
        return None
    return max(sessions, key=lambda session: session.startedAt)


def _build_auth_headers(session: SessionMetadata | None) -> dict[str, str] | None:
    if session is None:
        return None
    secret = Path(session.secretPath).read_bytes()
    cookie_value = AUTH_COOKIE_MANAGER.mint(session.id, secret)
    bootstrap_token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)
    return {
        "Cookie": f"{C.AUTH_COOKIE_NAME}={cookie_value}",
        "Authorization": f"Bearer {bootstrap_token}",
    }


def _reverse_image_bytes(value: bytes) -> bytes:
    image_module, image_ops_module = _load_pillow_modules()
    with image_module.open(BytesIO(value)) as image:
        mirrored = image_ops_module.mirror(image)
        buffer = BytesIO()
        mirrored.save(buffer, format=image.format or "PNG")
    return buffer.getvalue()


def _store_binary_payload(
    payload: bytes,
    mime_type: str,
    *,
    store_root: Path,
) -> BinaryContentRef:
    store = BinaryStore(root=store_root)
    ref = store.store_bytes(payload, mime_type=mime_type)
    return ref


def _build_listener(
    project_name: str,
    *,
    draw_dep_name: str,
    image_artifact_id: str,
    store_root: Path,
    host: str | None,
    port: int | None,
    auth_headers: dict[str, str] | None,
) -> SettaListener:
    listener = SettaListener(
        project_name=project_name,
        host=host or C.HOST,
        port=port or C.PORT,
        auth_headers=auth_headers,
    )
    logger.info(
        "listener config project=%s host=%s port=%s dep=%s image_id=%s store_root=%s auth=%s",
        project_name,
        host or C.HOST,
        port or C.PORT,
        draw_dep_name,
        image_artifact_id,
        store_root.resolve(),
        "yes" if auth_headers else "no",
    )

    @listener.listen(deps=[draw_dep_name], run_on_refresh=True)
    async def _on_drawing_change(state, ctx) -> None:
        logger.info("callback fired changed=%s events=%d", list(ctx.changed), len(ctx.events))
        draw_value = getattr(state, draw_dep_name, None)
        if draw_value is None:
            logger.warning("state.%s is None; no bytes to process", draw_dep_name)
            return
        if isinstance(draw_value, bytes):
            logger.info("received draw bytes len=%d", len(draw_value))
        else:
            logger.warning("state.%s is %s, expected bytes", draw_dep_name, type(draw_value))
            return
        reversed_bytes = _reverse_image_bytes(draw_value)
        logger.info("reversed bytes len=%d", len(reversed_bytes))
        binary_ref = _store_binary_payload(
            reversed_bytes,
            "image/png",
            store_root=store_root,
        )
        logger.info(
            "stored binary ref contentId=%s byteLength=%d mimeType=%s",
            binary_ref.contentId,
            binary_ref.byteLength,
            binary_ref.mimeType,
        )
        await ctx.emit_to_frontend(
            artifact_updates=[
                ImageArtifact(
                    id=image_artifact_id,
                    value=binary_ref,
                )
            ]
        )
        logger.info("emitted ImageArtifact id=%s", image_artifact_id)

    return listener


def main() -> None:
    configure_listener_logging(level_override="DEBUG")
    parser = argparse.ArgumentParser(
        description="Manual listener that mirrors the drawing artifact."
    )
    parser.add_argument(
        "--project-name",
        default=None,
        help="Project config name to watch. "
        "Required unless SETTA_PROJECT_NAME is set.",
    )
    parser.add_argument(
        "--dep-name",
        default=DEFAULT_DRAW_DEP_NAME,
        help="Dependency name for the Draw section (sanitized section name).",
    )
    parser.add_argument(
        "--image-id",
        default=DEFAULT_IMAGE_ARTIFACT_ID,
        help="Image artifact id to update (matches Image section imagePath).",
    )
    parser.add_argument(
        "--binary-root",
        default=str(Path("setta_files") / C.BINARY_FOLDER_NAME),
        help="Binary store root path (defaults to setta_files/binary).",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="Backend host override (defaults to config).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Backend port override (defaults to config).",
    )
    parser.add_argument(
        "--session-id",
        default=None,
        help="Override the session id for auth + host/port discovery.",
    )
    parser.add_argument(
        "--sessions-root",
        default=None,
        help="Override sessions root (defaults to setta_files/run/sessions).",
    )
    args = parser.parse_args()
    sessions_root = Path(args.sessions_root) if args.sessions_root else None
    session = _resolve_session_metadata(args.session_id, sessions_root)
    resolved_host = args.host or (session.host if session else None)
    resolved_port = args.port or (session.port if session else None)
    auth_headers = _build_auth_headers(session) if session else None
    if session:
        logger.info(
            "using session id=%s host=%s port=%s secret=%s",
            session.id,
            session.host,
            session.port,
            session.secretPath,
        )
    else:
        logger.info("no session metadata found; using explicit host/port")
    listener = _build_listener(
        resolve_project_name(args.project_name),
        draw_dep_name=args.dep_name,
        image_artifact_id=args.image_id,
        store_root=Path(args.binary_root),
        host=resolved_host,
        port=resolved_port,
        auth_headers=auth_headers,
    )
    listener.start()


if __name__ == "__main__":
    main()
