import { sendMessage } from "dbRequests/websocket";
import _ from "lodash";
import { useNotification } from "models/notification";
import { useTypeErrors } from "models/typeErrors";
import { useWebsocketRooms } from "models/websocket";
import { createNewId } from "z_utils/utils";
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
  const id = createNewId();
  const unsub = useWebsocketRooms.subscribe(
    (x) => x[id],
    (x) => {
      useTypeErrors.setState(x, true);
      unsub();
      useWebsocketRooms.getState().deleteRoom(id);
      useNotification
        .getState()
        .setMessage(_.size(x) > 0 ? "Found type errors" : "All good!");
    }
  );
  const project = getProjectDataToGenerateCode();
  useNotification.getState().setMessage("Checking types...");
  sendMessage({ id, messageType: "typeCheckRequest", message: project });
}

export const debouncedRequestTypeCheck = _.debounce(
  () => requestTypeCheck(),
  1000
);
