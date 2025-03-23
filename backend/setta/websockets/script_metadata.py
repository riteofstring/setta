class ScriptMetadata:
    def __init__(self):
        self.metadata = {}

    def add(self, data):
        self.metadata.update(data)
        print("after add ScriptMetadata", self.metadata, flush=True)

    def delete(self, id):
        del self.metadata[id]
        print("after delete ScriptMetadata", self.metadata, flush=True)
