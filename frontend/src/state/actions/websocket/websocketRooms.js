import _ from "lodash";
import { sendMessage } from "requests/websocket";
import { useWebsocketRooms } from "state/definitions";
import { createNewId } from "utils/idNameCreation";

export function createWebsocketRoom(id) {
  useWebsocketRooms.setState({ [id]: "" });
}

export function deleteWebsocketRoom(id) {
  useWebsocketRooms.setState((state) => _.omit(state, [id]), true);
}

export function setWebsocketRoomMessage(id, message) {
  useWebsocketRooms.setState({ [id]: message });
}

export async function sendMessageInRoom({
  id,
  messageType,
  content,
  condition,
}) {
  return new Promise((resolve) => {
    const actualId = id ? id : createNewId();
    const unsub = useWebsocketRooms.subscribe(
      (x) => x[actualId],
      (x) => {
        if (!condition || condition(x)) {
          unsub();
          resolve(x);
          deleteWebsocketRoom(actualId);
        }
      },
    );

    sendMessage({
      id: actualId,
      messageType,
      content,
    });
  });
}
