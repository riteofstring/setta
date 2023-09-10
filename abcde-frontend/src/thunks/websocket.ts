import { createNewId } from "abcde-utils/src/utils";
import { sendMessage } from "dbRequests/websocket";
import { useWebsocketRooms } from "models/websocket";
import { getProjectDataToGenerateCode } from "./generateCode";

export function requestParameters(name, callback) {
  const id = createNewId();
  const unsub = useWebsocketRooms.subscribe(
    (x) => x[id],
    (x) => {
      if (x) {
        callback(x);
        unsub();
        useWebsocketRooms.getState().deleteRoom(id);
      }
    }
  );
  sendMessage({ id, messageType: "parametersRequest", message: name });
}

export function requestTypeCheck() {
  const project = getProjectDataToGenerateCode();
  console.log("requestTypeCheck");
  sendMessage({ messageType: "typeCheckRequest", message: project });
}
