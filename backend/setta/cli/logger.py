import os
from abc import ABC, abstractmethod
from pathlib import Path

import requests

from setta.utils.constants import (
    CODE_FOLDER_ENV_VARIABLE,
    HOST_ENV_VARIABLE,
    PORT_ENV_VARIABLE,
    SEND_DATA_TO_ENV_VARIABLE,
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
        self.send_data_to = os.environ.get(SEND_DATA_TO_ENV_VARIABLE)

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
            data_to_send[rel_path] = data

        requests.post(
            f"{C.BACKEND}{C.ROUTE_PREFIX}{C.ROUTE_SEND_DATA}",
            json={
                "data": data_to_send,
                "sendDataTo": self.send_data_to,
                "isSaved": save,
                "rootPath": str(self.root_path),
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
        return self.data


class SettaNumpyImg(SettaDataWrapper):
    def __init__(self, img, extension="png"):
        self.img = img
        self.extension = extension

    def save(self, path):
        pil_image = Image.fromarray(self.img)
        pil_image.save(f"{path}.{self.extension}")

    def serialize(self):
        pass
