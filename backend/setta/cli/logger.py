import os
from abc import ABC, abstractmethod
from pathlib import Path

import requests

from setta.utils.constants import C

try:
    from PIL import Image
except ImportError:
    pass


class Setta:
    def __init__(self, root_path=None):
        if root_path is None:
            self.root_path = Path(
                os.environ.get(C.CODE_FOLDER_ENV_VARIABLE, os.getcwd())
            )

    def log(self, obj, save=False):
        for rel_path, data in obj.items():
            if not isinstance(data, SettaDataWrapper):
                data = SettaGenericData(data)

            if save:
                full_path = self.root_path / rel_path
                directory = full_path.parent
                directory.mkdir(parents=True, exist_ok=True)
                data.save(full_path)

            data = data.serialize()
            requests.post(
                C.backend_api(C.ROUTE_SEND_DATA),
                json={"data": data},
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
