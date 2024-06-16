import json

from fastapi import WebSocket

from runcoder.database.utils import generate_memorable_string


# https://fastapi.tiangolo.com/advanced/websockets/#handling-disconnections-and-multiple-clients
class WebsocketManager:
    def __init__(self, tasks):
        self.sockets = {}
        self.use_server_as_cli = True
        self.server_cli_id = "main"
        self.tasks = tasks

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        id = websocket.headers.get("websocketId")
        while (not id) or id in self.sockets:
            id = generate_memorable_string()
        isCLI = "Python" in websocket.headers.get("user-agent", "")
        self.sockets[id] = {"websocket": websocket, "isCLI": isCLI}
        await self.send_message(
            {"toWebsocketId": id, "messageType": "connection", "websocketId": id},
            fromWebsocketId=self.server_cli_id,
        )
        await self.send_message(
            {
                "toWebsocketId": id,
                "messageType": "interactiveProjects",
                "websocketId": id,
                "message": self.tasks.custom_fn_names,
            },
            fromWebsocketId=self.server_cli_id,
        )
        await self.broadcast_connections()
        return id

    async def disconnect(self, id):
        del self.sockets[id]
        await self.broadcast_connections()

    async def send_message(self, message, fromWebsocketId):
        if "toWebsocketId" in message:
            wid = message["toWebsocketId"]
            if wid == self.server_cli_id:
                # process task and send any results back to requester
                websocket = self.sockets[fromWebsocketId]["websocket"]
                result = await self.tasks(message["messageType"], message)
                if result["output"]:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "id": message["id"],
                                "message": result["output"],
                                "toWebsocketId": wid,
                                "messageType": result["name"],
                            }
                        )
                    )
            else:
                # just send data to target websocket
                websocket = self.sockets[wid]["websocket"]
                await websocket.send_text(
                    json.dumps({**message, "websocketId": fromWebsocketId})
                )

    async def broadcast(self, message):
        for s in self.sockets.values():
            await s["websocket"].send_text(json.dumps(message))

    async def broadcast_connections(self):
        connections = []
        for id, s in self.sockets.items():
            connections.append({"websocketId": id, "isCLI": s["isCLI"]})
        if self.use_server_as_cli:
            connections.append({"websocketId": self.server_cli_id, "isCLI": True})
        await self.broadcast(
            {"messageType": "allConnections", "connections": connections}
        )
