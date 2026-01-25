import argparse
import importlib
import os
from io import BytesIO
from pathlib import Path

from setta.api import SettaListener
from setta.binary import BinaryStore
from setta.logging.config import configure_listener_logging
from setta.types.artifact import ImageArtifact
from setta.types.binary_content import BinaryContentRef
from setta.utils.constants import C


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


def _reverse_image_bytes(value: bytes) -> bytes:
    image_module, image_ops_module = _load_pillow_modules()
    with image_module.open(BytesIO(value)) as image:
        mirrored = image_ops_module.mirror(image)
        buffer = BytesIO()
        mirrored.save(buffer, format=image.format or "PNG")
    return buffer.getvalue()


def _store_binary_payload(payload: bytes, mime_type: str) -> BinaryContentRef:
    store_root = Path("setta_files") / C.BINARY_FOLDER_NAME
    return BinaryStore(root=store_root).store_bytes(payload, mime_type=mime_type)


def _build_listener(project_name: str) -> SettaListener:
    print("_build_listener", project_name)
    listener = SettaListener(project_name=project_name)

    @listener.listen(deps=["the_drawing"], run_on_refresh=True)
    async def _on_drawing_change(state, ctx) -> None:
        if not state.the_drawing:
            print("returning early because state.the_drawing is None")
            return
        reversed_bytes = _reverse_image_bytes(state.the_drawing)
        binary_ref = _store_binary_payload(reversed_bytes, "image/png")
        await ctx.emit_to_frontend(
            artifact_updates=[
                ImageArtifact(
                    id="reversed_image.png",
                    value=binary_ref,
                )
            ]
        )

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
    args = parser.parse_args()
    listener = _build_listener(resolve_project_name(args.project_name))
    listener.start()


if __name__ == "__main__":
    main()
