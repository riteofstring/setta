import base64
import importlib
import os
from io import BytesIO

from setta.api import SettaListener
from setta.logging.config import configure_listener_logging
from setta.types.artifact import ImageArtifact


def _load_pillow_modules():
    image_module = importlib.import_module("PIL.Image")
    image_ops_module = importlib.import_module("PIL.ImageOps")
    return image_module, image_ops_module


def _default_project_name() -> str:
    project_name = os.environ.get("SETTA_PROJECT_NAME")
    if not project_name:
        raise ValueError(
            "Project name required. Set SETTA_PROJECT_NAME before running."
        )
    return project_name


def _reverse_image_data(value: str) -> str:
    prefix = "data:image/png;base64,"
    payload = value
    if value.startswith("data:") and "," in value:
        header, payload = value.split(",", 1)
        prefix = f"{header},"
    decoded = base64.b64decode(payload)
    image_module, image_ops_module = _load_pillow_modules()
    with image_module.open(BytesIO(decoded)) as image:
        mirrored = image_ops_module.mirror(image)
        buffer = BytesIO()
        mirrored.save(buffer, format=image.format or "PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return prefix + encoded


def _build_listener(project_name: str) -> SettaListener:
    print("_build_listener", project_name)
    listener = SettaListener(project_name=project_name)

    @listener.listen(deps=["the_drawing"], run_on_refresh=True)
    async def _on_drawing_change(state, ctx) -> None:
        if not state.the_drawing:
            print("returning early because state.the_drawing is None")
            return
        reversed_data = _reverse_image_data(state.the_drawing)
        await ctx.emit_to_frontend(
            artifact_updates=[
                ImageArtifact(
                    id="reversed_image.png",
                    value=reversed_data,
                )
            ]
        )

    return listener


def main() -> None:
    configure_listener_logging(level_override="DEBUG")
    listener = _build_listener(_default_project_name())
    listener.start()


if __name__ == "__main__":
    main()
