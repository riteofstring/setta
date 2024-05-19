import requests

from .request_utils import post


class RuncoderLoginError(Exception):
    pass


class Runcoder:
    toLocation = None
    run_id = None

    def __init__(self):
        self.groupkey_to_ids = {}

    def log(self, group, key, value):
        id_key = (group, key)
        group = {"id": None, "name": group}
        key = {"id": None, "name": key}
        if id_key in self.groupkey_to_ids:
            (group["id"], key["id"]) = self.groupkey_to_ids[id_key]
            need_ids = False
        else:
            need_ids = True

        x = {
            "type": "LOG",
            "data": {"group": group, "key": key, "values": [value]},
            "toLocation": self.toLocation,
            "needIds": need_ids,
            "runId": self.run_id,
        }
        r = post(requests, "logging", json=x)

        if need_ids and r.status_code == 200:
            returned_data = r.json()
            self.groupkey_to_ids[id_key] = (
                returned_data["groupId"],
                returned_data["keyId"],
            )
