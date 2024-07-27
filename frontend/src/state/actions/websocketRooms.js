import _ from "lodash";
import { useWebsocketRooms } from "state/definitions/websocketRooms";

export function createWebsocketRoom(id) {
  useWebsocketRooms.setState({ [id]: "" });
}

export function deleteWebsocketRoom(id) {
  useWebsocketRooms.setState((state) => _.omit(state, [id]), true);
}

export function setWebsocketRoomMessage(id, message) {
  useWebsocketRooms.setState({ [id]: message });
}
