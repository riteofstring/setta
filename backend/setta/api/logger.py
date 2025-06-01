import asyncio
import json
import os
from pathlib import Path

import requests
from setta.api.data_wrappers import (
    SettaChatHistory,
    SettaDataWrapper,
    SettaImg,
    SettaList,
)
import websockets

from setta.utils.constants import CODE_FOLDER_ENV_VARIABLE, C

DataWrapperDict = dict[str, SettaDataWrapper]


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

    def log(self, obj: DataWrapperDict, save_to="db"):
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

    def prepare_data(self, obj: DataWrapperDict, save_to=None):
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
