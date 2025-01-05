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
    def __init__(self, root_path=None, send_data_to=None):
        load_constants()
        set_constants(
            host=os.environ.get(HOST_ENV_VARIABLE, C.DEFAULT_HOST),
            port=os.environ.get(PORT_ENV_VARIABLE, C.DEFAULT_PORT),
        )
        if root_path:
            self.root_path = Path(root_path)
        else:
            self.root_path = Path(os.environ.get(CODE_FOLDER_ENV_VARIABLE, os.getcwd()))
        
        if send_data_to:
            self.send_data_to = send_data_to
        else:
            self.send_data_to = os.environ.get(SEND_ARTIFACT_TO_ENV_VARIABLE)

    def log(self, obj, save=False):
        data_to_send = {}
        for rel_path, data in obj.items():
            full_path = self.root_path / rel_path

            if save:
                directory = full_path.parent
                directory.mkdir(parents=True, exist_ok=True)
                data.save(data.path_with_extension(full_path))

            data_to_send[data.path_with_extension(full_path)] = {
                **data.serialize(),
                "name": rel_path,
                "isSaved": save,
            }

        print("data_to_send", data_to_send)

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
    def path_with_extension(self, path):
        pass

    @abstractmethod
    def save(self, path):
        pass

    @abstractmethod
    def serialize(self):
        pass

    @abstractmethod
    def load(self, path_with_extension):
        pass


class SettaListData(SettaDataWrapper):
    def __init__(self, data=None):
        self.data = data

    def path_with_extension(self, path):
        return f"{path}.csv"

    def save(self, path_with_extension):
        if not self.data: return
        headers = list(self.data[0].keys())
        with open(path_with_extension, "w") as f:
            f.write(",".join(headers) + "\n")
            for row_dict in self.data:
                row_vals = []
                for h in headers:
                    val = row_dict.get(h, None)
                    row_vals.append("" if val is None else str(val))
                f.write(",".join(row_vals) + "\n")


    def serialize(self):
        return {"value": self.data, "type": "list"}

    def load(self, path_with_extension):
        with open(path_with_extension, "r") as f:
            headers = f.readline().strip().split(",")
            data = []
            for line in f:
                values = line.strip().split(",")
                # Convert each value to float if not empty, otherwise None
                row = []
                for x in values:
                    if x.strip() == "":
                        row.append(None)
                    else:
                        try:
                            row.append(float(x))
                        except ValueError:
                            row.append(x)
                data.append(tuple(row))
        self.data = {"headers": headers, "data": data}


class SettaNumpyImg(SettaDataWrapper):
    def __init__(self, img=None, format="png"):
        self.img = Image.fromarray(img) if img is not None else img
        self.format = format

    def path_with_extension(self, path):
        return f"{path}.{self.format}"

    def save(self, path):
        self.img.save(self.path_with_extension(path))

    def serialize(self):
        img_byte_arr = BytesIO()
        self.img.save(
            img_byte_arr, format=self.format
        )  # You can change 'PNG' to other formats if needed
        base64_encoded = base64.b64encode(img_byte_arr.getvalue())
        return {"value": base64_encoded.decode("utf-8"), "type": "img"}

    def load(self, path_with_extension):
        self.img = Image.open(path_with_extension)


def get_wrapper_for_loading(data_type):
    if data_type == "list":
        return SettaListData()
    if data_type == "img":
        return SettaNumpyImg()


def default_section_type(data_type):
    if data_type == "list":
        return C.CHART
    if data_type == "img":
        return C.IMAGE


def save_base64_to_png(base64_string, output_file):
    image_data = base64.b64decode(base64_string)

    # Write the binary data to a file
    with open(output_file, "wb") as f:
        f.write(image_data)
