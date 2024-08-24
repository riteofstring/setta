import base64
import os
from abc import ABC, abstractmethod
from io import BytesIO
from pathlib import Path

import requests

from setta.utils.constants import (
    CODE_FOLDER_ENV_VARIABLE,
    HOST_ENV_VARIABLE,
    PORT_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
    load_constants,
    set_constants,
)

try:
    from PIL import Image
except ImportError:
    pass


class Setta:
    def __init__(self):
        load_constants()
        set_constants(
            host=os.environ.get(HOST_ENV_VARIABLE, C.DEFAULT_HOST),
            port=os.environ.get(PORT_ENV_VARIABLE, C.DEFAULT_PORT),
        )
        self.root_path = Path(os.environ.get(CODE_FOLDER_ENV_VARIABLE, os.getcwd()))
        self.send_data_to = os.environ.get(SEND_ARTIFACT_TO_ENV_VARIABLE)

    def log(self, obj, save=False):
        data_to_send = {}
        for rel_path, data in obj.items():
            if not isinstance(data, SettaDataWrapper):
                data = SettaGenericData(data)

            if save:
                full_path = self.root_path / rel_path
                directory = full_path.parent
                directory.mkdir(parents=True, exist_ok=True)
                data.save(full_path)

            data = data.serialize()
            data_to_send[rel_path] = {
                **data,
                "isSaved": save,
                "rootPath": str(self.root_path),
            }

        requests.post(
            f"{C.BACKEND}{C.ROUTE_PREFIX}{C.ROUTE_SEND_ARTIFACT}",
            json={
                "data": data_to_send,
                "sendDataTo": self.send_data_to,
                "messageType": C.WS_ARTIFACT,
            },
            headers={"Content-Type": "application/json"},
        )


class SettaDataWrapper(ABC):
    @abstractmethod
    def save(self, path):
        pass

    @abstractmethod
    def serialize(self):
        pass


class SettaGenericData(SettaDataWrapper):
    def __init__(self, data):
        self.data = data

    def save(self, path):
        pass

    def serialize(self):
        return {"value": self.data, "type": "generic"}


class SettaNumpyImg(SettaDataWrapper):
    def __init__(self, img, format="png"):
        self.img = img
        self.format = format
        self.pil_image = None

    def save(self, path):
        self.pil_image = Image.fromarray(self.img)
        self.pil_image.save(f"{path}.{self.format}")

    def serialize(self):
        if not self.pil_image:
            self.pil_image = Image.fromarray(self.img)
        img_byte_arr = BytesIO()
        self.pil_image.save(
            img_byte_arr, format=self.format
        )  # You can change 'PNG' to other formats if needed
        base64_encoded = base64.b64encode(img_byte_arr.getvalue())
        return {"value": base64_encoded.decode("utf-8"), "type": "img"}
