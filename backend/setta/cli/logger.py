import os
from pathlib import Path

import requests

from setta.utils.constants import C

try:
    from PIL import Image
except ImportError:
    pass


class Setta:
    def __init__(self):
        self.root_path = Path(os.environ.get(C.CODE_FOLDER_ENV_VARIABLE, os.getcwd()))

    def log(self, obj, save=False):
        for rel_path, data in obj.items():
            if save:
                full_path = self.root_path / rel_path
                directory = full_path.parent
                directory.mkdir(parents=True, exist_ok=True)
                data.save(full_path)


class SettaNumpyImg:
    def __init__(self, img, extension="png"):
        self.img = img
        self.extension = extension

    def save(self, path):
        pil_image = Image.fromarray(self.img)
        pil_image.save(f"{path}.{self.extension}")
