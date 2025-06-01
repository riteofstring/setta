import asyncio
import base64
import json
import os
from abc import ABC, abstractmethod
from io import BytesIO
from pathlib import Path

import requests
import websockets

from setta.types.artifact import ArtifactType
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
        self.name_path_type_to_id = {}
        self.websocket = websocket
        self.endpoint = f"{C.WEBSOCKET}{C.ROUTE_WEBSOCKET_PYTHON_LOGGER}"

    def log(self, obj, save_to="db"):
        data = self.prepare_data(obj, save_to)

        requests.post(
            f"{C.BACKEND}{C.ROUTE_PREFIX}{C.ROUTE_SEND_ARTIFACT}",
            json={"data": data},
            headers={"Content-Type": "application/json"},
        )

    async def send_async(self, obj, messageType=None):
        if messageType is None:
            messageType = C.WS_ARTIFACT
        if messageType == C.WS_ARTIFACT:
            obj = self.prepare_data(obj)
        if not self.websocket:
            self.websocket = await websockets.connect(self.endpoint)
        await self.websocket.send(
            json.dumps({"content": obj, "messageType": messageType})
        )

    def send(self, obj, messageType=None):
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're in an async context, schedule the task
                asyncio.create_task(self.send_async(obj, messageType))
            else:
                # We're not in an async context, run until complete
                loop.run_until_complete(self.send_async(obj, messageType))
        except RuntimeError:
            # No event loop in thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.send_async(obj, messageType))

    def prepare_data(self, obj, save_to=None):
        data_to_send = []
        id_missing = False
        for name, data in obj.items():
            artifact_path = ""

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
            id = self.maybe_get_artifact_id(curr_data)
            curr_data["id"] = id
            if not id:
                id_missing = True
            data_to_send.append(curr_data)

        if id_missing:
            self.fill_in_missing_artifact_ids(data_to_send)

        return data_to_send

    def maybe_get_artifact_id(self, artifact):
        return self.name_path_type_to_id.get(self.get_name_path_type_key(artifact))

    def fill_in_missing_artifact_ids(self, data_to_send):
        res = requests.post(
            f"{C.BACKEND}{C.ROUTE_PREFIX}{C.ROUTE_FILL_IN_MISSING_ARTIFACT_IDS}",
            json={"namesPathsTypes": data_to_send},
            headers={"Content-Type": "application/json"},
        )

        if res.status_code == 200:
            artifact_ids = res.json()
            for idx, id in enumerate(artifact_ids):
                self.name_path_type_to_id[
                    self.get_name_path_type_key(data_to_send[idx])
                ] = id
                data_to_send[idx]["id"] = id

    def get_name_path_type_key(self, artifact):
        return artifact["name"], artifact["path"], artifact["type"]

    def list(self, name):
        """Get a list object configured for this logger"""
        return SettaList().with_context(self, name)

    def image(self, name):
        """Get an image object configured for this logger"""
        return SettaImg().with_context(self, name)

    def chat(self, name):
        """Get a chat object configured for this logger"""
        return SettaChatHistory().with_context(self, name)


class SettaDataWrapper(ABC):
    def __init__(self):
        self._logger = None
        self._name = None

    def with_context(self, logger, name):
        self._logger = logger
        self._name = name
        return self

    def log(self):
        if not self._logger or not self._name:
            raise ValueError("Object must be associated with a logger")
        return self._logger.log({self._name: self})

    def send(self):
        if not self._logger or not self._name:
            raise ValueError("Object must be associated with a logger")
        return self._logger.send({self._name: self})

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
    def __init__(self, **columns):
        super().__init__()
        self.create(**columns)

    def create(self, **columns):
        self.data = columns
        return self

    def append(self, **columns):
        for column, values in columns.items():
            if column in self.data:
                self.data[column].extend(values)
            else:
                self.data[column] = values
        return self

    def path_with_extension(self, path):
        return path.with_suffix(".csv")

    def save(self, path):
        if not self.data:
            return

        headers = list(self.data.keys())
        num_rows = len(next(iter(self.data.values())))  # Get length from first column

        with open(path, "w") as f:
            # Write headers
            f.write(",".join(headers) + "\n")

            # Write rows
            for i in range(num_rows):
                row_vals = []
                for header in headers:
                    val = self.data[header][i] if i < len(self.data[header]) else None
                    row_vals.append("" if val is None else str(val))
                f.write(",".join(row_vals) + "\n")

    def serialize(self):
        return {"value": self.data, "type": ArtifactType.LIST}

    def load(self, path):
        self.data = load_from_csv_file(path)


class SettaImg(SettaDataWrapper):
    def __init__(self, img=None, format="png"):
        super().__init__()
        self.create(img, format)

    def create(self, img, format="png"):
        self.img = img
        self.format = format
        return self

    def path_with_extension(self, path):
        return path.with_suffix(f".{self.format}")

    def save(self, path):
        with open(path, "wb") as f:
            f.write(self.img)

    def serialize(self):
        if self.img is None:
            raise ValueError("No image data to serialize")
        b64_str = base64.b64encode(self.img).decode("utf-8")
        return {"value": b64_str, "type": ArtifactType.IMG}

    def load(self, path_with_extension):
        with open(path_with_extension, "rb") as f:
            self.img = f.read()


class SettaChatHistory(SettaDataWrapper):
    def __init__(self, messages=None):
        super().__init__()
        self.create(messages or [])

    def create(self, messages):
        """Initialize chat history with messages."""
        self.messages = messages if messages else []
        return self

    def append(self, role, content):
        """Add a new message to the chat history."""
        self.messages.append({"role": role, "content": content})
        return self

    def append_to_last(self, content, role="assistant"):
        """
        Append content to the last message or create a new one if needed.
        Perfect for streaming LLM responses.

        Args:
            content: The content to append
            role: Role to use if creating a new message (default: "assistant")

        Returns:
            self for method chaining
        """
        if not self.messages or self.messages[-1]["role"] != role:
            # No messages or last message has different role - create new
            self.append(role, content)
        else:
            # Append to existing message
            self.messages[-1]["content"] += content

        return self

    def path_with_extension(self, path):
        return path.with_suffix(".json")

    def save(self, path):
        with open(path, "w") as f:
            json.dump(self.messages, f)

    def serialize(self):
        return {"value": self.messages, "type": "chat"}

    def load(self, path_with_extension):
        with open(path_with_extension, "r") as f:
            self.messages = json.load(f)


def get_wrapper_for_loading(type: ArtifactType):
    match type:
        case ArtifactType.LIST:
            return SettaList()
        case ArtifactType.IMG:
            return SettaImg()
        case ArtifactType.CHAT_HISTORY:
            return SettaChatHistory()
        case ArtifactType.BRUSH_STROKES:
            raise ValueError  # TODO


def default_section_type(data_type):
    if data_type == ArtifactType.LIST:
        return C.CHART
    if data_type == ArtifactType.IMG:
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


def parse_csv_row(values):
    row = []
    for x in values:
        if x.strip() == "":
            row.append(None)
        else:
            try:
                row.append(float(x))
            except ValueError:
                row.append(x)
    return row


def parse_csv_content(content):
    lines = content.strip().split("\n")
    if not lines:
        return {}

    headers = [h.strip() for h in lines[0].split(",")]
    result = {header: [] for header in headers}

    if not lines[1:]:
        return result

    # Parse rows and populate lists
    for line in lines[1:]:
        values = parse_csv_row(line.strip().split(","))
        for header, value in zip(headers, values):
            result[header].append(value)

    return result


def load_from_csv_file(path):
    with open(path, "r") as f:
        content = f.read()
    return parse_csv_content(content)


def load_from_csv_base64(base64_string):
    content = base64.b64decode(base64_string).decode("utf-8")
    return parse_csv_content(content)
