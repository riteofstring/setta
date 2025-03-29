import json

from setta.utils.utils import remove_empty


class ScriptMetadata:
    def __init__(self):
        self.deps_to_websocket_ids = {}

    def add(self, websocket_id, data):
        for _, metadata in data.items():
            deps = metadata["dependencies"]
            for d in deps:
                if d not in self.deps_to_websocket_ids:
                    self.deps_to_websocket_ids[d] = set()
                self.deps_to_websocket_ids[d].add(websocket_id)

        print("after add ScriptMetadata", self.deps_to_websocket_ids, flush=True)

    def delete(self, websocket_id):
        for _, wids in self.deps_to_websocket_ids.items():
            wids.discard(websocket_id)

        self.deps_to_websocket_ids = remove_empty(self.deps_to_websocket_ids)
        print("after delete ScriptMetadata", self.deps_to_websocket_ids, flush=True)

    def get_websocket_ids_listening_to_data(self, data):
        ids = self.deps_to_websocket_ids.get(None, set())
        # for k,v in data.items():
        # ids.update(self.deps_to_websocket_ids.get(tuple(json.loads(k))))
        # data = {: v for k, v in data.items()}
        return ids
