import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from .dependencies import get_websocket_manager

router = APIRouter()


@router.websocket("/")
async def websocket_endpoint(
    websocket: WebSocket, websocket_manager=Depends(get_websocket_manager)
):
    print("regular websocket", websocket)
    id = await websocket_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print("received message", flush=True)
            await websocket_manager.send_message(json.loads(data), fromWebsocketId=id)
    except WebSocketDisconnect:
        await websocket_manager.disconnect(id)
