import { createNewId } from "abcde-utils/src/utils";
import { sendMessage } from "dbRequests/websocket";
import { useWebsocketRooms } from "models/websocket";

export function requestParameters(name, callback) {
  const id = createNewId();
  const unsub = useWebsocketRooms.subscribe((state) => {
    if (state[id]) {
      callback(state[id]);
      unsub();
    }
  });
  sendMessage({ id, messageType: "parametersRequest", message: name });
}
