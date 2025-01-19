import json
import traceback

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from setta.utils.constants import C

from .dependencies import get_tasks_from_websocket, get_websocket_manager_from_websocket

router = APIRouter()


@router.websocket(C.ROUTE_WEBSOCKET_MANAGER)
async def websocket_endpoint(
    websocket: WebSocket,
    websocket_manager=Depends(get_websocket_manager_from_websocket),
    tasks=Depends(get_tasks_from_websocket),
):
    print("regular websocket", websocket)
    id = await websocket_manager.connect(websocket)
    while True:
        try:
            data = await websocket.receive_text()
            print("received message", flush=True)
            await websocket_manager.send_message(
                json.loads(data), fromWebsocketId=id, tasks=tasks
            )
        except WebSocketDisconnect:
            print("WebSocketDisconnect!", flush=True)
            await websocket_manager.disconnect(id)
            break
        except Exception as e:
            print(f"Exception details:\n{traceback.format_exc()}")
            print(e, flush=True)
            print("caught the exception!", flush=True)
