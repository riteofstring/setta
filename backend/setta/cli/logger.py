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

        self.name_path_type_to_id = {}

    def log(self, obj, save_to="db"):
        data_to_send = []
        for name, data in obj.items():
            artifact_path = None

            if save_to == "disk":
                full_path = self.root_path / name
                full_path = data.path_with_extension(full_path)
                directory = full_path.parent
                directory.mkdir(parents=True, exist_ok=True)
                data.save(full_path)
                artifact_path = str(full_path)

            serialized = data.serialize()
            curr_data = {
                "name": name,
                "path": artifact_path,
                "value": serialized["value"],
                "type": serialized["type"],
            }
            curr_data["id"] = self.maybe_get_artifact_id(curr_data)
            data_to_send.append(curr_data)

        res = requests.post(
            f"{C.BACKEND}{C.ROUTE_PREFIX}{C.ROUTE_SEND_ARTIFACT}",
            json={
                "data": data_to_send,
                "saveTo": save_to,
                "sendDataTo": self.send_data_to,
                "messageType": C.WS_ARTIFACT,
            },
            headers={"Content-Type": "application/json"},
        )

        if res.status_code == 200:
            artifact_ids = res.json()
            for idx, id in enumerate(artifact_ids):
                sent_data = data_to_send[idx]
                self.name_path_type_to_id[self.get_name_path_type_key(sent_data)] = id

    def maybe_get_artifact_id(self, data_to_send):
        return self.name_path_type_to_id.get(self.get_name_path_type_key(data_to_send))

    def get_name_path_type_key(self, data_to_send):
        return data_to_send["name"], data_to_send["path"], data_to_send["type"]


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


class SettaList(SettaDataWrapper):
    def __init__(self, data=None):
        self.data = data

    def path_with_extension(self, path):
        return path.with_suffix(".csv")

    def save(self, path):
        if not self.data:
            return
        headers = list(self.data[0].keys())
        with open(path, "w") as f:
            f.write(",".join(headers) + "\n")
            for row_dict in self.data:
                row_vals = []
                for h in headers:
                    val = row_dict.get(h, None)
                    row_vals.append("" if val is None else str(val))
                f.write(",".join(row_vals) + "\n")

    def serialize(self):
        return {"value": self.data, "type": "list"}

    def load(self, path):
        with open(path, "r") as f:
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


class SettaImg(SettaDataWrapper):
    def __init__(self, img=None, format="png"):
        self.img = img
        self.format = format

    def path_with_extension(self, path):
        return path.with_suffix(f".{self.format}")

    def save(self, path):
        with open(path, "wb") as f:
            f.write(self.img)

    def serialize(self):
        if self.img is None:
            raise ValueError("No image data to serialize")
        b64_str = base64.b64encode(self.img).decode("utf-8")
        return {"value": b64_str, "type": "img"}

    def load(self, path_with_extension):
        with open(path_with_extension, "rb") as f:
            self.img = f.read()


def get_wrapper_for_loading(data_type):
    if data_type == "list":
        return SettaList()
    if data_type == "img":
        return SettaImg()


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


def pil_to_setta_img(pil_image, format="png"):
    buffer = BytesIO()
    pil_image.save(buffer, format=format.upper())
    raw_data = buffer.getvalue()
    return SettaImg(img=raw_data, format=format)
