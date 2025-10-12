import base64
import os
from pathlib import Path

from setta.types.routes import Route
from setta.utils.constants import CODE_FOLDER_ENV_VARIABLE, C


class SettaLogger:
    def __init__(
        self, root_path=None, host=C.DEFAULT_HOST, port=C.DEFAULT_PORT, websocket=None
    ):
        C.HOST = host
        C.PORT = port
        self.root_path = Path(
            root_path or os.environ.get(CODE_FOLDER_ENV_VARIABLE, ".")
        )
        self.websocket = websocket
        self.endpoint = f"{C.WEBSOCKET}{Route.WEBSOCKET_PYTHON_LOGGER}"

    def log(self, obj):
        # TODO
        pass


def save_base64_to_png(base64_string, output_file):
    image_data = base64.b64decode(base64_string)

    # Write the binary data to a file
    with open(output_file, "wb") as f:
        f.write(image_data)
