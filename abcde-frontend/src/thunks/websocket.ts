import { useWebsocketRooms } from "models/websocket";

export function setWebsocketRoomMessage(message) {
  useWebsocketRooms.getState().setMessage(message.id, message.message);
}
