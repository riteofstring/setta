import base64
import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
BACKEND_PATH = str(BACKEND_DIR)
if BACKEND_PATH in sys.path:
    sys.path.remove(BACKEND_PATH)
ROOT_PATH = str(ROOT_DIR)
if ROOT_PATH not in sys.path:
    sys.path.insert(0, ROOT_PATH)
sys.path.insert(0, BACKEND_PATH)

import logging

from setta.api import SettaListener
from setta.types.artifact import ImageArtifact

logging.basicConfig(level=logging.DEBUG)


def _default_project_name() -> str:
    data = json.loads(Path("setta_files/project.json").read_text())
    project_id = data["defaultProjectConfigId"]
    return data["projectConfigs"][project_id]["name"]


def _reverse_image_data(value: str) -> str:
    prefix = "data:image/png;base64,"
    payload = value
    if value.startswith("data:") and "," in value:
        header, payload = value.split(",", 1)
        prefix = f"{header},"
    decoded = base64.b64decode(payload)
    with Image.open(BytesIO(decoded)) as image:
        mirrored = ImageOps.mirror(image)
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
    listener = _build_listener(_default_project_name())
    listener.start()


if __name__ == "__main__":
    main()
